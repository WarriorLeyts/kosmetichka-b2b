import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { resolveJwtSecret } from "@/lib/jwtSecret";

const secret = new TextEncoder().encode(resolveJwtSecret());

/** Admin panel host (admin.kosmetichka-opt.ru): its pages live in app/cms, its API in app/api/cms */
const CMS_HOST = (process.env.CMS_HOST || "admin.kosmetichka-opt.ru").toLowerCase();

// only Host: nginx sets it itself for every site (an X-Forwarded-Host sent by a client is not trusted)
function requestHost(request: NextRequest): string {
  return (request.headers.get("host") ?? "").trim().split(":")[0].toLowerCase();
}

function isCmsHost(host: string): boolean {
  return host === CMS_HOST || host === "admin.localhost";
}

/** Paths of the admin host that are not its pages (API, Next files, photos) */
function cmsPassThrough(pathname: string): boolean {
  return /^\/(api|_next|1c|app)\//.test(pathname) || /^\/favicon\.(ico|svg)$/.test(pathname) || pathname === "/robots.txt";
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const cmsHost = isCmsHost(requestHost(request));

  if (cmsHost) {
    if (pathname === "/robots.txt") {
      return new NextResponse("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
    }
    if (!cmsPassThrough(pathname)) {
      // the panel's addresses have no /cms prefix: admin.kosmetichka-opt.ru/products → app/cms/products
      if (pathname === "/cms" || pathname.startsWith("/cms/")) {
        const url = request.nextUrl.clone();
        url.pathname = pathname.slice(4) || "/";
        return NextResponse.redirect(url);
      }
      const url = request.nextUrl.clone();
      url.pathname = "/cms" + (pathname === "/" ? "" : pathname);
      const res = NextResponse.rewrite(url);
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
      return res;
    }
  } else if (pathname === "/cms" || pathname.startsWith("/cms/") || pathname.startsWith("/api/cms/")) {
    // the panel works only on its own host (its own login cookie)
    return new NextResponse("Not found", { status: 404 });
  }

  // --- Admin API routes: require admin or manager role, return JSON 401 ---
  // Вход и выход доступны всем: иначе сборщик, HR и сотрудник не могли выйти (403 до самого обработчика)
  if (pathname.startsWith("/api/admin/") && pathname !== "/api/admin/login" && pathname !== "/api/admin/logout") {
    const token = request.cookies.get("admin_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      // Сборщику — каталог в карточке заказа (поиск товаров и категории, только чтение)
      const pickerReadable =
        request.method === "GET" &&
        (pathname === "/api/admin/products/search" || pathname === "/api/admin/categories");
      const allowed = payload.role === "admin" || payload.role === "manager" || (pickerReadable && payload.role === "picker");
      if (!allowed) {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
  }

  // --- Admin routes: require admin or manager role ---
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = request.cookies.get("admin_token")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    try {
      const { payload } = await jwtVerify(token, secret);

      if (payload.role !== "admin" && payload.role !== "manager") {
        return NextResponse.redirect(new URL("/admin/login", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // --- Picker routes: require picker, manager, or admin role ---
  if (pathname.startsWith("/picker") && pathname !== "/picker/login") {
    const token = request.cookies.get("admin_token")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/picker/login", request.url));
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      const role = payload.role as string;

      if (!["admin", "manager", "picker"].includes(role)) {
        return NextResponse.redirect(new URL("/picker/login", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/picker/login", request.url));
    }
  }

  // --- Staff tests (/academy, test.kosmetichka-opt.ru): any staff account ---
  if (pathname.startsWith("/academy") && pathname !== "/academy/login" && pathname !== "/academy/register") {
    const token = request.cookies.get("admin_token")?.value;
    // Внешний адрес берём из заголовков nginx: сам Next за прокси знает только 127.0.0.1
    const toLogin = () => {
      const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
      const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
      let url: URL;
      try {
        url = new URL("/academy/login", host ? `${proto}://${host}` : request.url);
      } catch {
        url = new URL("/academy/login", request.url); // кривой Host — не падаем
      }
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    };
    if (!token) return toLogin();
    try {
      const { payload } = await jwtVerify(token, secret);
      // только роли сотрудников: токен покупателя подписан тем же секретом
      if (!["admin", "manager", "picker", "employee", "hr"].includes(payload.role as string)) return toLogin();
    } catch {
      return toLogin();
    }
  }

  // --- Customer routes: require auth_token ---
  // /catalog is intentionally public — guests can browse with retail prices
  const customerRoutes = ["/orders", "/profile", "/wishlist"];
  const isCustomerRoute = customerRoutes.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );

  // the phone app's invoice link carries its own 10-minute pass (?t=, checked by the page itself)
  const invoiceLink = /^\/orders\/\d+\/invoice$/.test(pathname) && request.nextUrl.searchParams.has("t");

  if (isCustomerRoute && !invoiceLink) {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    try {
      const { payload } = await jwtVerify(token, secret);
      // токен сотрудника подписан тем же секретом — в кабинет покупателя не пускаем
      if (payload.role !== "customer") return NextResponse.redirect(new URL("/login", request.url));
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // every path: the admin host (admin.kosmetichka-opt.ru) is told apart by the Host header, not the path;
  // the checks above only act on their own paths
  matcher: ["/((?!_next/static|_next/image).*)"],
};
