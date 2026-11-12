import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/app/(public)/legal-page";
import { company } from "@/config/company";

export const metadata: Metadata = {
  title: "Aviso legal — Kindly",
  description: "Datos identificativos del titular del sitio, conforme a la LSSI-CE.",
};

/**
 * Required in Spain by the LSSI-CE (art. 10) for any site with commercial
 * activity. It is also the page a Meta reviewer uses to confirm that the
 * company behind the app is real and matches the verification documents,
 * so the identity here must match src/config/company.ts exactly.
 */
export default function LegalNoticePage() {
  return (
    <LegalPage
      title="Aviso legal"
      summary="Datos identificativos del titular de este sitio y condiciones generales de acceso, conforme al artículo 10 de la LSSI-CE."
    >
      <h2>1. Titular</h2>
      <ul>
        <li>
          <strong>Denominación social:</strong> {company.legalName}
        </li>
        <li>
          <strong>NIF/CIF:</strong> {company.taxId}
        </li>
        <li>
          <strong>Domicilio:</strong> {company.address}
        </li>
        <li>
          <strong>Correo electrónico:</strong> <a href={`mailto:${company.email}`}>{company.email}</a>
        </li>
        <li>
          <strong>Teléfono:</strong> {company.phone}
        </li>
        <li>
          <strong>Datos registrales:</strong> {company.registryDetails}
        </li>
      </ul>

      <h2>2. Objeto</h2>
      <p>
        Este sitio informa sobre Kindly, una plataforma de gestión de conversaciones, contactos y expedientes
        dirigida a despachos profesionales y gestorías, y da acceso a quienes ya tienen cuenta.
      </p>

      <h2>3. Condiciones de uso</h2>
      <p>
        Acceder a este sitio implica aceptar este aviso. El usuario se compromete a hacer un uso adecuado de los
        contenidos y a no emplearlos para actividades ilícitas o que dañen los derechos de terceros.
      </p>
      <p>
        El uso de la plataforma, más allá de este sitio informativo, se rige por los{" "}
        <Link href="/terminos">términos del servicio</Link>.
      </p>

      <h2>4. Propiedad intelectual e industrial</h2>
      <p>
        Los contenidos de este sitio —textos, diseño, marcas y código— pertenecen a {company.legalName} o a
        terceros que han autorizado su uso. No se permite su reproducción o distribución sin autorización previa
        por escrito, más allá del uso personal.
      </p>

      <h2>5. Responsabilidad</h2>
      <p>
        {company.legalName} no se hace responsable de los daños derivados del uso indebido del sitio, ni de los
        contenidos de sitios de terceros enlazados desde aquí.
      </p>

      <h2>6. Protección de datos</h2>
      <p>
        El tratamiento de datos personales se detalla en la <Link href="/privacidad">política de privacidad</Link>.
      </p>

      <h2>7. Legislación aplicable</h2>
      <p>Este aviso se rige por la legislación española.</p>
    </LegalPage>
  );
}
