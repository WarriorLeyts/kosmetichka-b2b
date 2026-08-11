import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Пользовательское соглашение",
  robots: { index: true, follow: true },
};

export default function AgreementPage() {
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
          <h1 className="text-2xl font-black text-slate-800 mb-2">Пользовательское соглашение</h1>
          <p className="text-sm text-slate-400 mb-8">Дата вступления в силу: 1 января 2025 г.</p>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">1. Общие положения</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Настоящее Пользовательское соглашение (далее — «Соглашение») регулирует отношения между ООО «ВЕДУЧИ-1» (далее — «Продавец») и физическим или юридическим лицом (далее — «Пользователь»), использующим интернет-магазин <strong>kosmetichka-opt.ru</strong> (далее — «Сайт»).
            </p>
            <p className="text-sm text-slate-600 leading-relaxed mt-2">
              Регистрируясь на Сайте или оформляя заказ, Пользователь подтверждает, что ознакомился с настоящим Соглашением и принимает его условия в полном объёме. Если Пользователь не согласен с условиями Соглашения, он обязан прекратить использование Сайта.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">2. Сведения о Продавце</h2>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600 space-y-1">
              <p><strong>Наименование:</strong> ООО «ВЕДУЧИ-1»</p>
              <p><strong>ОГРН:</strong> 1152036001193</p>
              <p><strong>ИНН:</strong> 2004008212</p>
              <p><strong>КПП:</strong> 201501001</p>
              <p><strong>Адрес:</strong> 364037, Чеченская Республика, г. Грозный, р-н Ахматовский, ул. им. М.Н. Нурбагандова, 1А</p>
              <p><strong>Сайт:</strong> kosmetichka-opt.ru</p>
            </div>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">3. Предмет Соглашения</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Продавец предоставляет Пользователю возможность приобретать товары оптом (косметика, парфюмерия и сопутствующие товары) через Сайт на условиях, установленных настоящим Соглашением. Минимальная сумма заказа и условия доставки указываются на Сайте и могут изменяться.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">4. Регистрация и учётная запись</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-2">
              Для оформления заказов Пользователь обязан пройти регистрацию, указав достоверные данные. Пользователь несёт ответственность за:
            </p>
            <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li>сохранность данных своей учётной записи (логин и пароль);</li>
              <li>все действия, совершённые с использованием его учётной записи;</li>
              <li>своевременное уведомление Продавца о несанкционированном доступе к учётной записи.</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-2">
              Продавец вправе отказать в регистрации или заблокировать учётную запись без объяснения причин в случае нарушения условий настоящего Соглашения.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">5. Оформление заказа и оплата</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-2">
              Заказ считается принятым к исполнению с момента его подтверждения менеджером Продавца. Цены на товары указаны в рублях без учёта доставки, если иное не оговорено. Оплата производится:
            </p>
            <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li>по счёту на расчётный счёт ООО «ВЕДУЧИ-1»;</li>
              <li>иными способами, согласованными с менеджером.</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-2">
              Продавец вправе в одностороннем порядке изменять цены на товары. Цена, зафиксированная в подтверждённом заказе, изменению не подлежит.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">6. Доставка и передача товара</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Сроки и стоимость доставки согласовываются индивидуально при оформлении заказа. Риск случайной гибели товара переходит к Покупателю с момента его передачи транспортной компании или вручения Покупателю. Претензии по количеству и качеству товара принимаются в течение 3 (трёх) рабочих дней с момента получения.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">7. Возврат товара</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Возврат товара надлежащего качества возможен только по согласованию с менеджером и при сохранении товарного вида, потребительских свойств, оригинальной упаковки и документов. Возврат товаров косметики и парфюмерии надлежащего качества регулируется действующим законодательством Российской Федерации.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">8. Ограничение ответственности</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Продавец не несёт ответственности за убытки, возникшие вследствие: ненадлежащего использования товара; предоставления Пользователем недостоверных данных; технических неисправностей оборудования и сетей третьих лиц; форс-мажорных обстоятельств. Ответственность Продавца ограничена стоимостью оплаченного заказа.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">9. Интеллектуальная собственность</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Все материалы Сайта (тексты, изображения, логотипы, дизайн) являются собственностью Продавца или правообладателей и охраняются законодательством об авторском праве. Использование материалов без письменного разрешения запрещено.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">10. Персональные данные</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Обработка персональных данных осуществляется в соответствии с <Link href="/privacy" className="text-pink-500 hover:underline">Политикой конфиденциальности</Link> и Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных». Регистрируясь на Сайте, Пользователь даёт согласие на обработку своих персональных данных.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">11. Разрешение споров</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Стороны обязуются разрешать споры путём переговоров. При недостижении соглашения спор передаётся в арбитражный суд по месту нахождения Продавца в соответствии с законодательством Российской Федерации.
            </p>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-bold text-slate-700 mb-2">12. Изменение условий</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Продавец вправе в одностороннем порядке изменять условия настоящего Соглашения. Новая редакция вступает в силу с момента её размещения на Сайте. Продолжение использования Сайта после изменений означает согласие Пользователя с новой редакцией.
            </p>
          </section>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <Link href="/privacy" className="text-sm text-pink-500 hover:underline mr-6">Политика конфиденциальности</Link>
            <Link href="/contacts" className="text-sm text-pink-500 hover:underline">Контакты</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
