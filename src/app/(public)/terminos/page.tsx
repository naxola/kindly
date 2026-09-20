import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/app/(public)/legal-page";
import { company } from "@/config/company";

export const metadata: Metadata = {
  title: "Términos del servicio — Kindly",
  description: "Condiciones de uso de Kindly: cuentas, uso aceptable, responsabilidad y cancelación.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Términos del servicio"
      summary="Las condiciones bajo las que se usa Kindly. En resumen: la herramienta ayuda a trabajar, el profesional sigue siendo responsable de lo que envía a sus clientes."
    >
      <h2>1. Quiénes somos y qué es esto</h2>
      <p>
        Estas condiciones regulan el uso de Kindly, la plataforma que presta {company.legalName} ({company.taxId}),
        con domicilio en {company.address}. Al crear una cuenta, aceptas lo que sigue.
      </p>

      <h2>2. Qué hace Kindly</h2>
      <p>
        Kindly reúne en una bandeja común las conversaciones de los canales que cada profesional conecta,
        las relaciona con contactos y expedientes, y ofrece un copiloto que propone respuestas y cita las fuentes
        en las que se apoya.
      </p>
      <p>
        <strong>Kindly no presta asesoramiento jurídico, fiscal ni laboral.</strong> Las sugerencias del copiloto
        son un borrador para el profesional, nunca un dictamen. El profesional debe revisarlas antes de usarlas, y
        es responsable del contenido que finalmente envía a su cliente. Ninguna respuesta se envía sin que una
        persona la acepte.
      </p>

      <h2>3. Cuentas</h2>
      <ul>
        <li>Debes dar datos veraces y mantener tu contraseña a salvo.</li>
        <li>Cada cuenta es personal. No la compartas.</li>
        <li>
          El administrador de una organización puede invitar a otras personas y asignarles un rol. Quien invita
          responde de a quién da acceso.
        </li>
        <li>Avísanos en cuanto sospeches de un acceso no autorizado.</li>
      </ul>

      <h2>4. Canales de mensajería</h2>
      <p>
        Cada profesional conecta su propia cuenta de WhatsApp Business o de Telegram, y debe tener derecho a
        hacerlo. Al conectarla aceptas además las condiciones del proveedor correspondiente.
      </p>
      <p>
        Esas plataformas son de terceros: pueden cambiar sus reglas, sus límites o su disponibilidad sin previo
        aviso, y eso puede afectar a lo que Kindly puede hacer. Cuando ocurra, te lo diremos y explicaremos qué
        cambia; no lo resolveremos usando mecanismos no oficiales.
      </p>
      <p>
        Conectar un número mediante la coexistencia de WhatsApp desactiva algunas funciones en el móvil. Antes de
        conectarlo te mostramos cuáles y tienes que confirmarlo expresamente.
      </p>

      <h2>5. Uso aceptable</h2>
      <p>Usando Kindly te comprometes a no:</p>
      <ul>
        <li>Enviar comunicaciones comerciales no solicitadas ni mensajes masivos no consentidos.</li>
        <li>Suplantar a otra persona o entidad.</li>
        <li>Subir contenido ilícito, ni contenido sobre el que no tengas derechos.</li>
        <li>Intentar acceder a datos de otra organización, ni sortear los límites técnicos del servicio.</li>
        <li>
          Presentar una sugerencia del copiloto como asesoramiento verificado sin haberla revisado.
        </li>
      </ul>

      <h2>6. Datos</h2>
      <p>
        El tratamiento de datos personales se rige por la{" "}
        <Link href="/privacidad">política de privacidad</Link>. Respecto de los datos de tus clientes, tú eres el
        responsable y nosotros el encargado del tratamiento.
      </p>
      <p>
        Los contenidos que subas siguen siendo tuyos. Nos concedes únicamente los permisos técnicos necesarios
        para almacenarlos y mostrártelos dentro del servicio.
      </p>

      <h2>7. Disponibilidad</h2>
      <p>
        Trabajamos para que el servicio esté disponible, pero no garantizamos que funcione sin interrupciones.
        Puede haber paradas por mantenimiento, incidencias propias o fallos de terceros de los que dependemos.
      </p>

      <h2>8. Precio</h2>
      <p>
        Las condiciones económicas son las acordadas con cada organización en el momento de la contratación.
        Cualquier cambio se comunica con antelación suficiente antes de que sea aplicable.
      </p>

      <h2>9. Responsabilidad</h2>
      <p>
        Respondemos de los daños causados por incumplimiento de estas condiciones en los términos previstos por la
        ley. No respondemos del uso que hagas de las sugerencias del copiloto sin revisarlas, ni de decisiones
        profesionales tomadas a partir de ellas, ni de fallos de las plataformas de mensajería de terceros.
      </p>
      <p>Nada de esto limita derechos que la ley te reconozca de forma imperativa.</p>

      <h2>10. Cancelación</h2>
      <p>
        Puedes dejar de usar Kindly y cerrar tu cuenta cuando quieras, siguiendo las instrucciones de{" "}
        <Link href="/eliminacion-de-datos">eliminar mis datos</Link>. Podemos suspender una cuenta que incumpla
        estas condiciones, avisando antes salvo que haya riesgo para otras personas o para el servicio.
      </p>

      <h2>11. Ley aplicable</h2>
      <p>
        Se aplica la legislación española. Para cualquier controversia, las partes se someten a los juzgados y
        tribunales que correspondan según la normativa vigente.
      </p>

      <h2>12. Contacto</h2>
      <p>
        Para cualquier duda sobre estas condiciones: <a href={`mailto:${company.email}`}>{company.email}</a>.
      </p>
    </LegalPage>
  );
}
