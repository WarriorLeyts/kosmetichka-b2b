import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Контакты",
  robots: { index: true, follow: true },
};

export default function ContactsPage() {
  return (
    <main className="min-h-screen" style={{ background: "linear-gradient(135deg, #fdf2f8 0%, #f5f3ff 50%, #eff6ff 100%)" }}>
      <nav className="bg-white/80 backdrop-blur border-b border-pink-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <Link href="/catalog" className="flex items-center gap-2">
          <span className="text-pink-500 text-xl">♡</span>
          <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-transparent text-lg font-black">Косметичка</span>
        </Link>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-3xl bg-white shadow-sm border border-white/60 px-8 py-10">
          <h1 className="text-2xl font-black text-slate-800 mb-6">Контакты</h1>

          {/* Company info */}
          <section className="mb-8">
            <h2 className="text-base font-bold text-slate-700 mb-3">Реквизиты организации</h2>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-4 text-sm text-slate-600 space-y-2">
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">Наименование</span>
                <span className="font-semibold text-slate-800">ООО «ВЕДУЧИ-1»</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">ОГРН</span>
                <span>1152036001193</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">ИНН</span>
                <span>2004008212</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">КПП</span>
                <span>201501001</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">Директор</span>
                <span>Исаев Анзор Ансарович</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">Адрес</span>
                <span>364037, Чеченская Республика, г. Грозный, р-н Ахматовский, ул. им. М.Н. Нурбагандова, 1А</span>
              </div>
            </div>
          </section>

          {/* Bank info */}
          <section className="mb-8">
            <h2 className="text-base font-bold text-slate-700 mb-3">Банковские реквизиты</h2>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-4 text-sm text-slate-600 space-y-2">
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">Банк</span>
                <span>СТАВРОПОЛЬСКОЕ ОТДЕЛЕНИЕ N5230 ПАО СБЕРБАНК</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">Р/С</span>
                <span className="font-mono">40702810860540000535</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">К/С</span>
                <span className="font-mono">30101810907020000615</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-28 shrink-0">БИК</span>
                <span className="font-mono">040702615</span>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="mb-8">
            <h2 className="text-base font-bold text-slate-700 mb-3">Связаться с нами</h2>
            <div className="rounded-xl bg-pink-50 border border-pink-100 px-4 py-4 text-sm text-slate-600 space-y-2">
              <p>По вопросам заказов и сотрудничества обращайтесь к вашему менеджеру или через личный кабинет на сайте.</p>
              <p className="mt-2">
                <span className="text-slate-400">Сайт: </span>
                <span className="font-medium">kosmetichka-opt.ru</span>
              </p>
            </div>
          </section>

          {/* PD operator info for Roskomnadzor */}
          <section className="mb-8">
            <h2 className="text-base font-bold text-slate-700 mb-3">Оператор персональных данных</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              ООО «ВЕДУЧИ-1» является оператором персональных данных в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных». По вопросам обработки персональных данных, отзыва согласия или реализации иных прав субъекта персональных данных обращайтесь по юридическому адресу организации.
            </p>
            <p className="text-sm text-slate-600 mt-2">
              Жалобы на обработку персональных данных вы вправе направить в Федеральную службу по надзору в сфере связи, информационных технологий и массовых коммуникаций (Роскомнадзор): <span className="font-medium">rkn.gov.ru</span>.
            </p>
          </section>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <Link href="/privacy" className="text-sm text-pink-500 hover:underline mr-6">Политика конфиденциальности</Link>
            <Link href="/agreement" className="text-sm text-pink-500 hover:underline">Пользовательское соглашение</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
