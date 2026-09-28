"use client";

import { useState } from "react";
import { startCoexistenceConnectionAction } from "@/modules/messaging/actions";
import type { PreflightCheck } from "@/modules/messaging/whatsapp-onboarding";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * The acknowledgement checklist (PKG-008). Client-side only to keep the
 * submit button disabled until every point is ticked — the server action
 * re-checks all of them anyway, because a disabled button is a courtesy,
 * not a guarantee.
 */
export function CoexistencePreflightForm({
  channel,
  checks,
  countryCheckAvailable,
}: {
  channel: string;
  checks: PreflightCheck[];
  countryCheckAvailable: boolean;
}) {
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [countryCode, setCountryCode] = useState("");

  const allAcknowledged = checks.every((check) => acknowledged[check.id]);
  const countryReady = !countryCheckAvailable || countryCode.trim().length === 2;
  const connectThisChannel = startCoexistenceConnectionAction.bind(null, channel);

  return (
    <form action={connectThisChannel} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {checks.map((check) => (
          <li key={check.id}>
            <Card className="p-3">
              <label className="flex items-start gap-3">
                <Checkbox
                  name="acknowledged"
                  value={check.id}
                  checked={Boolean(acknowledged[check.id])}
                  onChange={(event) =>
                    setAcknowledged((current) => ({ ...current, [check.id]: event.target.checked }))
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block type-label text-foreground">{check.title}</span>
                  <span className="block type-body text-foreground-light">{check.detail}</span>
                </span>
              </label>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="p-3">
        {countryCheckAvailable ? (
          <Field label="País del número" description="Código de dos letras. Comprobamos que coexistence esté disponible en ese país antes de empezar.">
            <Input
              id="countryCode"
              name="countryCode"
              className="w-24 uppercase"
              placeholder="ES"
              maxLength={2}
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              required
            />
          </Field>
        ) : (
          <>
            <p className="type-label text-foreground">País del número</p>
            <p className="mt-1 type-caption text-foreground-lighter">
              Todavía no podemos comprobar automáticamente si coexistence está disponible en tu país: Meta no
              publica la lista de regiones excluidas en un formato que podamos consultar, y copiarla de una fuente
              no oficial sería peor que no comprobarla. Confírmalo con Meta si tienes dudas.
            </p>
          </>
        )}
      </Card>

      <Alert tone="neutral" title="Qué pasa al continuar">
        Te llevaremos a Facebook para que elijas la cuenta que quieres conectar y autorices el acceso. Sigue las
        instrucciones de Meta y vuelve aquí al terminar; Kindly detectará la conexión.
      </Alert>

      <SubmitButton disabled={!allAcknowledged || !countryReady} className="w-fit">
        Continuar con Facebook
      </SubmitButton>
    </form>
  );
}
