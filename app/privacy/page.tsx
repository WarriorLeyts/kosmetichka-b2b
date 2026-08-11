import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen" style={{ background: "linear-gradient(135deg, #fdf2f8 0%, #f5f3ff 50%, #eff6ff 100%)" }}>
      <nav className="bg-white/80 backdrop-blur border-b border-pink-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <Link href="/catalog" className="flex items-center gap-2">
          <span className="text-pink-500 text-xl">♡</span>
          <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-transparent text-lg font-black">Косметичка</span>
        </Link>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-3xl bg-white shadow-sm border border-white/60 px-8 py-10">
          <h1 className="text-2xl font-black text-slate-800 mb-2">Политика конфиденциальности</h1>
          <p className="text-sm text-slate-400 mb-8">Дата вступления в силу: 1 января 2025 г.</p>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">1. Общие положения</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Настоящая Политика конфиденциальности (далее — «Политика») регулирует порядок обработки персональных данных пользователей сайта <strong>kosmetichka-opt.ru</strong> (далее — «Сайт»), принадлежащего ООО «ВЕДУЧИ-1» (далее — «Оператор»).
            </p>
            <p className="text-sm text-slate-600 leading-relaxed mt-2">
              Политика разработана в соответствии с требованиями Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных».
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">2. Сведения об операторе</h2>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600 space-y-1">
              <p><strong>Наименование:</strong> ООО «ВЕДУЧИ-1»</p>
              <p><strong>ОГРН:</strong> 1152036001193</p>
              <p><strong>ИНН:</strong> 2004008212</p>
              <p><strong>Адрес:</strong> 364037, Чеченская Республика, г. Грозный, р-н Ахматовский, ул. им. М.Н. Нурбагандова, 1А</p>
              <p><strong>Директор:</strong> Исаев Анзор Ансарович</p>
              <p><strong>Сайт:</strong> kosmetichka-opt.ru</p>
            </div>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">3. Персональные данные, которые мы обрабатываем</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-2">При регистрации и использовании Сайта Оператор может обрабатывать следующие персональные данные:</p>
            <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li>Фамилия, имя, отчество</li>
              <li>Наименование организации, ИНН</li>
              <li>Номер телефона</li>
              <li>Адрес электронной почты</li>
              <li>Город и адрес доставки</li>
              <li>IP-адрес и данные браузера (cookie)</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">4. Цели обработки персональных данных</h2>
            <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li>Регистрация и идентификация пользователя на Сайте</li>
              <li>Оформление и исполнение заказов на поставку товаров</li>
              <li>Обратная связь и поддержка пользователей</li>
              <li>Отправка уведомлений о статусе заказов</li>
              <li>Улучшение качества работы Сайта</li>
            </ul>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">5. Правовые основания обработки</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Обработка персональных данных осуществляется на основании согласия субъекта персональных данных (ст. 6, ч. 1, п. 1 № 152-ФЗ) и в целях исполнения договора, стороной которого является субъект персональных данных (ст. 6, ч. 1, п. 5 № 152-ФЗ).
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">6. Хранение и защита данных</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Персональные данные хранятся на серверах, расположенных на территории Российской Федерации. Оператор принимает необходимые технические и организационные меры для защиты персональных данных от несанкционированного доступа, изменения, раскрытия или уничтожения.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">7. Файлы cookie</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Сайт использует файлы cookie для обеспечения его функционирования, запоминания предпочтений пользователя и анализа трафика. Используя Сайт, вы соглашаетесь на использование cookie. Вы можете отключить cookie в настройках браузера, однако это может повлиять на работоспособность Сайта.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">8. Передача данных третьим лицам</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Оператор не передаёт персональные данные третьим лицам, за исключением случаев, предусмотренных законодательством Российской Федерации, или с согласия субъекта персональных данных.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">9. Права субъекта персональных данных</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-2">Вы вправе:</p>
            <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li>Получить информацию об обработке ваших персональных данных</li>
              <li>Потребовать уточнения, блокирования или уничтожения ваших данных</li>
              <li>Отозвать согласие на обработку персональных данных</li>
              <li>Обжаловать действия Оператора в Роскомнадзор</li>
            </ul>
            <p className="text-sm text-slate-600 mt-2">Для реализации своих прав обратитесь к нам через страницу <Link href="/contacts" className="text-pink-500 hover:underline">Контакты</Link>.</p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">10. Срок хранения данных</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Персональные данные хранятся в течение срока действия договора с пользователем, а также в течение срока, установленного применимым законодательством. После достижения целей обработки данные уничтожаются.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">11. Изменения в Политике</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Оператор вправе вносить изменения в настоящую Политику. Новая редакция вступает в силу с момента её размещения на Сайте. Рекомендуем периодически проверять актуальность Политики.
            </p>
          </section>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <Link href="/contacts" className="text-sm text-pink-500 hover:underline mr-6">Контакты</Link>
            <Link href="/agreement" className="text-sm text-pink-500 hover:underline">Пользовательское соглашение</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
