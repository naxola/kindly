import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/app/(public)/legal-page";
import { company, subProcessors } from "@/config/company";

export const metadata: Metadata = {
  title: "Política de privacidad — Kindly",
  description:
    "Qué datos trata Kindly, con qué finalidad, con quién se comparten y cómo ejercer tus derechos.",
};

/**
 * Privacy policy. Meta checks this URL periodically and requires it to be
 * reachable with no login, over HTTPS, naming both the app and the company
 * — so it lives in the public route group and takes its identity from
 * src/config/company.ts.
 *
 * The content describes what the code actually does. Every retention
 * period, category of data and sub-processor here should be checkable
 * against docs/DATABASE.md and docs/INTEGRATIONS.md; if the product changes
 * and this page does not, the page becomes false rather than merely stale.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      summary="Kindly trata conversaciones entre despachos y sus clientes. Aquí está qué guardamos, por qué, durante cuánto tiempo y qué puedes pedirnos en cualquier momento."
    >
      <h2>1. Quién es responsable de tus datos</h2>
      <p>
        <strong>{company.legalName}</strong> ({company.taxId}), con domicilio en {company.address}, es responsable
        del tratamiento de los datos de las personas que usan Kindly como profesionales: su cuenta, su
        organización y su actividad en la plataforma.
      </p>
      <p>
        Para escribirnos sobre privacidad: <a href={`mailto:${company.privacyEmail}`}>{company.privacyEmail}</a>.
      </p>

      <h2>2. Dos papeles distintos, y por qué importa</h2>
      <p>
        Hay que separar dos cosas que a menudo se mezclan:
      </p>
      <ul>
        <li>
          <strong>Datos de los profesionales que usan Kindly.</strong> Nombre, correo, contraseña cifrada,
          organización y rol. De estos somos <strong>responsables</strong>.
        </li>
        <li>
          <strong>Datos de los clientes de cada despacho.</strong> Los contactos y las conversaciones que el
          despacho gestiona. De estos el responsable es <strong>el despacho</strong>; Kindly actúa como{" "}
          <strong>encargado del tratamiento</strong> y solo los trata siguiendo sus instrucciones y para prestarle
          el servicio.
        </li>
      </ul>
      <p>
        Si eres cliente de un despacho que usa Kindly y quieres ejercer tus derechos, dirígete a ese despacho: es
        quien decide qué se hace con tus datos. Si nos escribes a nosotros, te pondremos en contacto con él.
      </p>

      <h2>3. Qué datos tratamos</h2>

      <h3>De la cuenta profesional</h3>
      <ul>
        <li>Nombre y dirección de correo electrónico.</li>
        <li>Contraseña, guardada siempre cifrada, nunca en claro.</li>
        <li>Organización a la que pertenece y rol dentro de ella.</li>
        <li>Registro de actividad: qué se creó, se envió, se asignó o se conectó, y cuándo.</li>
      </ul>

      <h3>De los contactos y las conversaciones</h3>
      <ul>
        <li>Nombre mostrado y número de teléfono en formato internacional, cuando el proveedor lo facilita.</li>
        <li>Identificadores técnicos del proveedor de mensajería.</li>
        <li>Contenido de los mensajes enviados y recibidos, con su fecha y su estado de entrega.</li>
        <li>
          Historial anterior a la conexión, cuando se activa la coexistencia de WhatsApp: hasta 180 días de
          conversaciones individuales. Nunca grupos.
        </li>
        <li>Expedientes, tareas y notas que el despacho asocie a ese contacto.</li>
      </ul>

      <h3>Datos técnicos</h3>
      <ul>
        <li>
          El contenido original de las notificaciones que nos envían los proveedores de mensajería, que
          conservamos para poder reprocesar un mensaje si algo falla y para poder auditar qué se recibió.
        </li>
        <li>Registros de acceso y de errores.</li>
      </ul>
      <p>
        No pedimos ni tratamos categorías especiales de datos de forma deliberada. Si el contenido de una
        conversación las incluye, se trata bajo las instrucciones del despacho responsable.
      </p>

      <h2>4. Para qué los usamos y con qué base legal</h2>
      <ul>
        <li>
          <strong>Prestar el servicio</strong> —sincronizar conversaciones, organizar expedientes, generar
          sugerencias de respuesta—: ejecución del contrato con el despacho.
        </li>
        <li>
          <strong>Seguridad y trazabilidad</strong> —registro de actividad, detección de abusos—: interés legítimo
          en mantener el servicio seguro y auditable.
        </li>
        <li>
          <strong>Soporte y comunicaciones sobre el servicio</strong>: ejecución del contrato.
        </li>
        <li>
          <strong>Obligaciones legales</strong> —facturación, requerimientos—: cumplimiento de una obligación
          legal.
        </li>
      </ul>
      <p>
        <strong>No usamos los datos de tus clientes para entrenar modelos de lenguaje</strong>, ni propios ni de
        terceros.
      </p>

      <h2>5. WhatsApp y Telegram</h2>
      <p>
        Cuando un profesional conecta su cuenta, el proveedor correspondiente nos envía los mensajes de esa cuenta
        para que aparezcan en Kindly. En el caso de WhatsApp usamos la WhatsApp Business Platform de Meta a través
        de su proceso oficial de autorización.
      </p>
      <p>Concretamente, de WhatsApp recibimos:</p>
      <ul>
        <li>Los mensajes nuevos que recibe el profesional y los que él mismo envía desde su móvil.</li>
        <li>La lista de contactos asociada a esa cuenta.</li>
        <li>El historial previo descrito más arriba, cuando se activa la coexistencia.</li>
        <li>Los estados de entrega y lectura.</li>
      </ul>
      <p>
        Usamos esa información con un único fin: mostrar la conversación en la bandeja del despacho y permitirle
        responder. No la cedemos a terceros con fines publicitarios ni la cruzamos entre organizaciones distintas.
      </p>
      <p>
        No usamos mecanismos no oficiales para acceder a estas plataformas: ni automatización del navegador, ni
        sesiones simuladas, ni bibliotecas que imiten el protocolo del cliente.
      </p>

      <h2>6. Con quién los compartimos</h2>
      <p>
        Solo con proveedores que nos prestan servicios necesarios para que Kindly funcione, con contrato de
        encargo de tratamiento:
      </p>
      <ul>
        {subProcessors.map((processor) => (
          <li key={processor.name}>
            <strong>{processor.name}</strong> — {processor.purpose} Ubicación: {processor.location}
          </li>
        ))}
      </ul>
      <p>
        Cuando un proveedor trata datos fuera del Espacio Económico Europeo, la transferencia se ampara en las
        cláusulas contractuales tipo aprobadas por la Comisión Europea o en una decisión de adecuación.
      </p>
      <p>No vendemos datos personales. No los cedemos a anunciantes.</p>

      <h2>7. Cuánto tiempo los guardamos</h2>
      <ul>
        <li>
          <strong>Conversaciones y expedientes</strong>: mientras el despacho mantenga su cuenta activa. Al
          cancelarla, se eliminan en un plazo máximo de 30 días, salvo que la ley exija conservarlos más tiempo.
        </li>
        <li>
          <strong>Notificaciones originales de los proveedores</strong>: 90 días, el tiempo necesario para
          diagnosticar incidencias.
        </li>
        <li>
          <strong>Registro de actividad</strong>: mientras la cuenta esté activa, porque es lo que permite
          reconstruir qué pasó en un expediente.
        </li>
        <li>
          <strong>Datos de facturación</strong>: el plazo que exija la normativa fiscal.
        </li>
      </ul>

      <h2>8. Tus derechos</h2>
      <p>
        Puedes pedirnos acceder a tus datos, rectificarlos, suprimirlos, limitar su tratamiento, oponerte a él y
        solicitar su portabilidad. Escríbenos a{" "}
        <a href={`mailto:${company.privacyEmail}`}>{company.privacyEmail}</a> y te responderemos en el plazo legal
        de un mes.
      </p>
      <p>
        Para borrar tu cuenta y sus datos tienes las instrucciones detalladas en{" "}
        <Link href="/eliminacion-de-datos">eliminar mis datos</Link>.
      </p>
      <p>
        Si crees que no hemos atendido bien tu solicitud, puedes reclamar ante la Agencia Española de Protección
        de Datos (<a href="https://www.aepd.es">www.aepd.es</a>).
      </p>

      <h2>9. Seguridad</h2>
      <p>
        Las contraseñas se guardan cifradas. Las credenciales de los proveedores de mensajería no se almacenan en
        nuestra base de datos: esta solo guarda una referencia a un almacén de secretos. Todas las notificaciones
        entrantes se validan criptográficamente antes de procesarse, y cada consulta a la base de datos filtra por
        organización para que los datos de un despacho no sean accesibles desde otro.
      </p>

      <h2>10. Cambios en esta política</h2>
      <p>
        Si cambia de forma relevante, avisaremos a los despachos con cuenta activa antes de que la nueva versión
        sea aplicable. La fecha de la última actualización aparece al principio de esta página.
      </p>
    </LegalPage>
  );
}
