import type { Metadata } from "next";
import Link from "next/link";
import { company } from "@/config/company";

export const metadata: Metadata = {
  title: "Kindly — La bandeja de tu despacho, con la norma citada",
  description:
    "Bandeja unificada de WhatsApp y Telegram para despachos y gestorías. Cada conversación con su contacto, su caso y su historial. El copiloto propone con la fuente citada; decides tú.",
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Principles />
      <HowItWorks />
      <DataAndSecurity />
      <ClosingCta />
    </>
  );
}

function Hero() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20 lg:py-24">
        <div className="flex flex-col justify-center">
          <h1 className="headline text-[2.05rem] text-ink sm:text-[2.7rem] lg:text-[3.3rem]">
            Sigues respondiendo desde tu móvil. Kindly se encarga de que quede constancia.
          </h1>
          <p className="mt-6 max-w-[46ch] text-[16px] leading-relaxed text-ink-soft sm:mt-7 sm:text-[16.5px]">
            Las conversaciones de WhatsApp y Telegram de tu despacho entran en una bandeja común, con su contacto,
            su expediente y su historial. El copiloto redacta la respuesta y cita la norma en la que se apoya.
            Enviar sigue siendo cosa tuya.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href={`mailto:${company.email}?subject=Acceso%20a%20Kindly`}
              className="rounded-md bg-ink px-5 py-3 text-[14.5px] font-medium text-white hover:bg-ink-soft"
            >
              Solicitar acceso
            </a>
            <Link
              href="#producto"
              className="rounded-md border border-line px-5 py-3 text-[14.5px] font-medium text-ink hover:border-ink-faint"
            >
              Ver cómo funciona
            </Link>
          </div>

          <p className="mt-7 max-w-[42ch] text-[13.5px] leading-relaxed text-ink-faint">
            Cada profesional conecta su propio número. Kindly no centraliza la comunicación del despacho en una
            línea común.
          </p>
        </div>

        <SuggestionCard />
      </div>
    </section>
  );
}

/**
 * The hero is the product's most characteristic artifact rather than a
 * screenshot or a statistic: a copilot suggestion exactly as it is defined
 * in docs/PRODUCT.md sección 10 — issue, draft, evidence level, traceable
 * sources, warnings and what is missing.
 *
 * It deliberately shows PARTIAL evidence, not SUFFICIENT. The honest state
 * is the one worth putting on the homepage: a tool that tells you what it
 * does not know is the whole argument.
 */
function SuggestionCard() {
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-[30rem] rounded-2xl rounded-bl-sm bg-paper px-5 py-4">
        <p className="document text-[15.5px] leading-relaxed text-ink">
          Buenas, me han dado la baja esta mañana. ¿Tengo que mandaros algo o lo hacéis vosotros?
        </p>
        <p className="mt-2 text-[12.5px] text-ink-faint">Marta Ruiz · WhatsApp · 09:14</p>
      </div>

      <article className="rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,28,51,0.04),0_12px_32px_-12px_rgba(16,28,51,0.16)]">
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <span className="text-[13.5px] font-medium text-ink">Sugerencia del copiloto</span>
          <EvidenceBadge level="partial">Evidencia parcial</EvidenceBadge>
        </header>

        <div className="flex flex-col gap-5 px-5 py-5">
          <Field label="Qué ha detectado">
            <p className="text-[14.5px] leading-relaxed text-ink-soft">
              Baja por incapacidad temporal. Para tramitarla falta el parte de baja médico.
            </p>
          </Field>

          <Field label="Respuesta propuesta">
            <p className="document rounded-lg bg-paper px-4 py-3.5 text-[15px] leading-relaxed text-ink">
              Hola Marta, nos encargamos nosotros. Para empezar necesitamos el parte de baja que te ha dado el
              médico: puedes hacerle una foto y mandárnosla por aquí. En cuanto lo tengamos, lo presentamos y te
              confirmamos.
            </p>
          </Field>

          <Field label="En qué se apoya">
            <ul className="flex flex-col gap-2">
              <Source
                title="RD 625/2014, art. 2"
                meta="Vigente desde el 1 de septiembre de 2014"
              />
              <Source title="Protocolo interno de bajas" meta="Versión 3 · 12 de febrero de 2026" />
            </ul>
          </Field>

          <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <Field label="Aviso">
              <p className="text-[13.5px] leading-relaxed text-alert">
                No confirmes plazos de pago: dependen del convenio aplicable.
              </p>
            </Field>
            <Field label="Falta por saber">
              <p className="text-[13.5px] leading-relaxed text-ink-soft">
                El convenio de la empresa de Marta.
              </p>
            </Field>
          </div>
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-5 py-3.5">
          <span className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-white">Editar y enviar</span>
          <span className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-soft">Descartar</span>
          <span className="ml-auto text-[12.5px] text-ink-faint">Nada sale sin que lo envíes tú</span>
        </footer>
      </article>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-ink-faint">{label}</span>
      {children}
    </div>
  );
}

function EvidenceBadge({ level, children }: { level: "sufficient" | "partial"; children: React.ReactNode }) {
  const styles =
    level === "sufficient"
      ? "border-stamp/25 bg-stamp-soft text-stamp"
      : "border-evidence-partial/25 bg-[#fbf4e4] text-evidence-partial";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[12px] font-medium ${styles}`}>{children}</span>
  );
}

function Source({ title, meta }: { title: string; meta: string }) {
  return (
    <li className="flex items-baseline gap-2.5 border-l-2 border-stamp pl-3">
      <span className="document text-[14.5px] text-ink">{title}</span>
      <span className="text-[12.5px] text-ink-faint">{meta}</span>
    </li>
  );
}

/**
 * Three commitments, as a ledger of rows rather than a row of cards. They
 * are not a sequence, so they carry no numbers.
 */
function Principles() {
  const principles = [
    {
      claim: "Tu número sigue siendo tuyo",
      body: "Cada profesional conecta su propia cuenta de WhatsApp Business o de Telegram y sigue usándola en el móvil como siempre. Kindly sincroniza esa conversación; no la sustituye por una línea común del despacho ni obliga a nadie a cambiar de número.",
    },
    {
      claim: "El copiloto propone, tú envías",
      body: "Ninguna respuesta generada llega al cliente sin que una persona la lea y la acepte. No hay respuestas automáticas, ni un modo de activarlas sin querer.",
    },
    {
      claim: "Cada cita, con su fuente y su fecha",
      body: "Cuando el copiloto se apoya en una norma, enseña de cuál se trata, qué versión y desde cuándo está en vigor. Si no tiene base suficiente, lo dice en lugar de rellenar el hueco.",
    },
  ];

  return (
    <section id="producto" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
        <h2 className="headline max-w-[20ch] text-[1.7rem] text-ink sm:text-[2rem] lg:text-[2.4rem]">
          Tres cosas que no se negocian
        </h2>
        <dl className="mt-10 border-t border-line">
          {principles.map((principle) => (
            <div
              key={principle.claim}
              className="grid gap-3 border-b border-line py-7 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12"
            >
              <dt className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{principle.claim}</dt>
              <dd className="max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">{principle.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** A real sequence, so it is the one place that carries step numbers. */
function HowItWorks() {
  const steps = [
    {
      title: "Llega el mensaje",
      body: "Un cliente escribe al WhatsApp del profesional. El mensaje aparece en su móvil, como siempre, y también en la bandeja de Kindly.",
    },
    {
      title: "Se ordena solo",
      body: "Kindly lo asocia a su contacto y a su expediente. Si el remitente es desconocido, entra igualmente y queda marcado para identificarlo.",
    },
    {
      title: "El copiloto prepara la respuesta",
      body: "Lee la conversación, el expediente y la documentación del despacho, y redacta una propuesta con sus fuentes.",
    },
    {
      title: "Respondes tú",
      body: "Aceptas, editas o escribes de cero. Sale desde tu número, y queda registrado quién respondió y cuándo.",
    },
  ];

  return (
    <section className="border-b border-line bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
        <h2 className="headline max-w-[24ch] text-[1.7rem] text-ink sm:text-[2rem] lg:text-[2.4rem]">
          De un mensaje suelto a un expediente al día
        </h2>
        <ol className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[13px] font-medium text-ink-soft"
              >
                {index + 1}
              </span>
              <div>
                <h3 className="text-[16px] font-semibold tracking-[-0.015em] text-ink">{step.title}</h3>
                <p className="mt-1.5 max-w-[46ch] text-[14.5px] leading-relaxed text-ink-soft">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function DataAndSecurity() {
  const facts = [
    {
      title: "Cada despacho, aislado",
      body: "Los datos de una organización no son accesibles desde otra. El aislamiento se comprueba en cada consulta y está cubierto por tests automáticos.",
    },
    {
      title: "Solo canales oficiales",
      body: "La integración con WhatsApp usa la WhatsApp Business Platform de Meta y la de Telegram su API oficial de bots. No usamos sesiones no oficiales, automatización del navegador ni ingeniería inversa.",
    },
    {
      title: "Las credenciales no se guardan aquí",
      body: "Los tokens de los proveedores viven en un almacén de secretos. La base de datos solo guarda una referencia, nunca el secreto.",
    },
    {
      title: "No entrenamos modelos con tus datos",
      body: "Las conversaciones de tus clientes no se usan para entrenar modelos de lenguaje.",
    },
  ];

  return (
    <section id="datos" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h2 className="headline text-[1.7rem] text-ink sm:text-[2rem] lg:text-[2.4rem]">Datos y seguridad</h2>
            <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
              Kindly trata conversaciones con clientes de despachos y gestorías. Lo que hacemos con esos datos está
              detallado en la{" "}
              <Link href="/privacidad" className="text-stamp underline underline-offset-2">
                política de privacidad
              </Link>
              .
            </p>
          </div>

          <dl className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.title}>
                <dt className="text-[15.5px] font-semibold tracking-[-0.015em] text-ink">{fact.title}</dt>
                <dd className="mt-1.5 max-w-[44ch] text-[14.5px] leading-relaxed text-ink-soft">{fact.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="bg-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:py-20">
        <div>
          <h2 className="headline max-w-[18ch] text-[1.65rem] text-white sm:text-[1.9rem] lg:text-[2.2rem]">
            ¿Lo vemos con tu despacho?
          </h2>
          <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-white/70">
            Cuéntanos cuántos profesionales sois y qué canales usáis. Respondemos con una fecha para probarlo con
            vuestros propios números.
          </p>
        </div>
        <a
          href={`mailto:${company.email}?subject=Acceso%20a%20Kindly`}
          className="shrink-0 rounded-md bg-white px-6 py-3.5 text-[14.5px] font-medium text-ink hover:bg-paper"
        >
          Escríbenos
        </a>
      </div>
    </section>
  );
}
