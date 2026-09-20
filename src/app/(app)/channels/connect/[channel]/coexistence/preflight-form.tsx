"use client";

import { useState } from "react";
import { startCoexistenceConnectionAction } from "@/modules/messaging/actions";
import type { PreflightCheck } from "@/modules/messaging/whatsapp-onboarding";

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
          <li key={check.id} className="rounded border border-zinc-200 p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="acknowledged"
                value={check.id}
                checked={Boolean(acknowledged[check.id])}
                onChange={(event) =>
                  setAcknowledged((current) => ({ ...current, [check.id]: event.target.checked }))
                }
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium">{check.title}</span>
                <span className="block text-sm text-zinc-600">{check.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="rounded border border-zinc-200 p-3">
        <label className="block text-sm font-medium" htmlFor="countryCode">
          País del número
        </label>
        {countryCheckAvailable ? (
          <>
            <input
              id="countryCode"
              name="countryCode"
              className="mt-1 w-24 rounded border border-zinc-300 px-3 py-2 text-sm uppercase"
              placeholder="ES"
              maxLength={2}
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              required
            />
            <p className="mt-1 text-xs text-zinc-500">
              Código de dos letras. Comprobamos que coexistence esté disponible en ese país antes de empezar.
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">
            Todavía no podemos comprobar automáticamente si coexistence está disponible en tu país: Meta no publica
            la lista de regiones excluidas en un formato que podamos consultar, y copiarla de una fuente no oficial
            sería peor que no comprobarla. Confírmalo con Meta si tienes dudas.
          </p>
        )}
      </div>

      <div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
        <p className="font-medium">Qué pasa al continuar</p>
        <p>
          Te llevaremos a Facebook para que elijas la cuenta que quieres conectar y autorices el acceso. Sigue las
          instrucciones de Meta y vuelve aquí al terminar; Kindly detectará la conexión.
        </p>
      </div>

      <button
        type="submit"
        disabled={!allAcknowledged || !countryReady}
        className="w-fit rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        Continuar con Facebook
      </button>
    </form>
  );
}
