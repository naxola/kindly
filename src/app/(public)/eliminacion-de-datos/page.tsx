import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/app/(public)/legal-page";
import { company } from "@/config/company";

export const metadata: Metadata = {
  title: "Eliminar mis datos — Kindly",
  description: "Cómo pedir la eliminación de tu cuenta y de los datos asociados en Kindly.",
};

/**
 * Meta requires a "Data Deletion Instructions URL" for apps that use
 * Facebook Login, which WhatsApp's Embedded Signup does. It has to be a
 * public page a person can follow without logging in, so it lives here and
 * explains the route for each kind of person involved — a professional with
 * an account, and a client of a despacho who has none.
 */
export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Eliminar mis datos"
      summary="Cómo pedir que borremos tu cuenta y los datos asociados, qué se borra exactamente y en cuánto tiempo."
    >
      <h2>Si tienes una cuenta en Kindly</h2>
      <p>
        Escríbenos desde la dirección de correo de tu cuenta a{" "}
        <a href={`mailto:${company.privacyEmail}?subject=Eliminaci%C3%B3n%20de%20datos`}>
          {company.privacyEmail}
        </a>{" "}
        indicando que quieres eliminar tu cuenta. Verificaremos que la petición viene de ti y te confirmaremos
        cuando esté hecho.
      </p>
      <p>
        Si eres administrador de una organización, dinos también si quieres eliminar solo tu usuario o toda la
        organización con sus conversaciones y expedientes. No borramos una organización entera sin confirmación
        expresa: afecta al trabajo de las demás personas del despacho.
      </p>

      <h2>Si eres cliente de un despacho que usa Kindly</h2>
      <p>
        Tus datos los gestiona ese despacho, no nosotros: él decide qué se guarda y durante cuánto tiempo. Para
        ejercer tus derechos, dirígete directamente a él. Si nos escribes, trasladaremos tu solicitud y te
        indicaremos con quién continuar.
      </p>

      <h2>Qué se elimina</h2>
      <ul>
        <li>Tu usuario, con su nombre, correo y contraseña.</li>
        <li>Tu pertenencia a la organización y las invitaciones asociadas.</li>
        <li>
          Si se elimina la organización: sus contactos, conversaciones, mensajes, expedientes, tareas y el
          historial de actividad.
        </li>
        <li>Las conexiones con los canales de mensajería y las referencias a sus credenciales.</li>
      </ul>

      <h2>Qué puede quedar, y por qué</h2>
      <ul>
        <li>
          <strong>Datos de facturación</strong>, durante el plazo que exige la normativa fiscal.
        </li>
        <li>
          <strong>Copias de seguridad</strong>, que se sobrescriben en sus ciclos habituales. Durante ese periodo
          quedan aisladas y no se usan para nada más.
        </li>
      </ul>

      <h2>Plazos</h2>
      <p>
        Confirmamos la recepción en un plazo máximo de 72 horas y completamos la eliminación en un máximo de 30
        días desde que verificamos la identidad.
      </p>

      <h2>Desconectar WhatsApp no borra nada</h2>
      <p>
        Desconectar tu número de Kindly detiene la sincronización, pero no elimina lo ya sincronizado. Si quieres
        que además se borre, pídelo expresamente por el procedimiento de arriba.
      </p>
      <p>
        Puedes consultar el detalle de qué datos tratamos en la{" "}
        <Link href="/privacidad">política de privacidad</Link>.
      </p>
    </LegalPage>
  );
}
