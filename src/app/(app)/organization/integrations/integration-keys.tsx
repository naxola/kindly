"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound } from "lucide-react";
import { createIntegrationKeyAction, revokeIntegrationKeyAction } from "@/modules/affiliates/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/ui/relative-time";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

interface KeyView {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado`);
  } catch {
    toast.error("No se pudo copiar: selecciónalo y cópialo a mano");
  }
}

export function IntegrationKeys({ endpoint, keys }: { endpoint: string; keys: KeyView[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<KeyView | null>(null);

  async function create(formData: FormData) {
    setError(null);
    const result = await createIntegrationKeyAction(String(formData.get("name") ?? ""));
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreating(false);
    setToken(result.token);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Endpoint" description="Método POST, cuerpo JSON (el array de altas tal cual)">
        <Input readOnly value={endpoint} className="font-mono" />
      </Field>
      <div>
        <Button icon={<Copy />} onClick={() => copy(endpoint, "Endpoint")}>
          Copiar endpoint
        </Button>
      </div>

      <Alert tone="info" title="Cabecera de autenticación">
        <span>
          Envía <code className="font-mono">Authorization: Bearer &lt;clave&gt;</code> y{" "}
          <code className="font-mono">Content-Type: application/json</code>. Responde 202 con el resultado de cada alta.
        </span>
      </Alert>

      <div className="flex items-center justify-between gap-2">
        <h3 className="type-label text-foreground">Claves</h3>
        <Button variant="primary" icon={<KeyRound />} onClick={() => setCreating(true)}>
          Crear clave
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Clave</TableHead>
            <TableHead>Último uso</TableHead>
            <TableHead>
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.length === 0 && <TableEmpty colSpan={4} title="Todavía no hay claves" description="Crea una para conectar tu automatización." />}
          {keys.map((key) => (
            <TableRow key={key.id}>
              <TableCell className="font-medium text-foreground">{key.name}</TableCell>
              <TableCell className="font-mono text-foreground-lighter">{key.keyPrefix}…</TableCell>
              <TableCell className="text-foreground-lighter">{key.lastUsedAt ? <RelativeTime date={key.lastUsedAt} /> : "Sin usar"}</TableCell>
              <TableCell>
                <div className="flex justify-end">
                  {key.revokedAt ? (
                    <Badge tone="neutral">Revocada</Badge>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setRevoking(key)}>
                      Revocar
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Crear clave</DialogTitle>
          </DialogHeader>
          <form action={create} className="contents">
            <DialogBody>
              <Field label="Nombre" description="Para reconocerla después, por ejemplo «n8n altas»">
                <Input name="name" defaultValue="n8n" maxLength={80} required />
              </Field>
              {error && (
                <Alert tone="destructive" live>
                  {error}
                </Alert>
              )}
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setCreating(false)}>Cancelar</Button>
              <SubmitButton>Crear clave</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={token !== null} onOpenChange={(open) => !open && setToken(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Copia tu clave ahora</DialogTitle>
            <DialogDescription>Solo se muestra una vez. Si la pierdes, revócala y crea otra.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input readOnly value={token ?? ""} aria-label="Clave de integración" className="font-mono" onFocus={(event) => event.currentTarget.select()} />
          </DialogBody>
          <DialogFooter>
            <Button icon={<Copy />} onClick={() => token && copy(token, "Clave")}>
              Copiar
            </Button>
            <Button variant="primary" onClick={() => setToken(null)}>
              Ya la he guardado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revocar clave"
        description={`La automatización que use «${revoking?.name ?? ""}» dejará de poder enviar altas.`}
        confirmLabel="Revocar clave"
        variant="danger"
        successMessage="Clave revocada"
        onConfirm={async () => {
          if (!revoking) return;
          const result = await revokeIntegrationKeyAction(revoking.id);
          if (!result.ok) throw new Error(result.error);
          router.refresh();
        }}
      />
    </div>
  );
}
