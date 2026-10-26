import { describe, expect, it } from "vitest";
import {
  isDniShape,
  normalizeAffiliatePayload,
  normalizeSpanishPhone,
  parseBirthDate,
  parseFeeCents,
  toDisplayCase,
} from "@/modules/affiliates/normalize";
import { proposeDelegate } from "@/modules/affiliates/proposal";

const sample = {
  tipoSolicitud: "alta",
  validoParaProcesar: true,
  errores: [],
  afiliado: {
    nombre: "MARÍA VICTORIA",
    apellidos: "OSUNA GÓMEZ",
    dni: "30958467F",
    fechaNacimiento: "03-09-1982",
    genero: "Mujer",
    telefono: "656311794",
    email: "Victoria.Osuna.Gomez02@gmail.com",
    domicilio: { tipoVia: "Calle", direccion: "CAPITÁN DEMA", numero: "20", escalera: "", piso: "4", puerta: "B", otros: "", pais: "España", codigoPostal: "03007", poblacion: "ALACANT/ALICANTE", provincia: "Alicante-Alacant" },
    afiliacion: { provincia: "Alicante-Alacant", sector: "Educación No Universiaria", situacionLaboral: "Activo", cuotaMensual: "11.5 €", centroTrabajo: "IES MARENOSTRUM", provinciaTrabajo: "Alicante-Alacant" },
    delegadoId: null,
    situacion: "alta",
  },
};

describe("field normalizers", () => {
  it("title-cases only all-uppercase names", () => {
    expect(toDisplayCase("MARÍA VICTORIA")).toBe("María Victoria");
    expect(toDisplayCase("DE LA O-GÓMEZ")).toBe("De La O-Gómez");
    expect(toDisplayCase("Ana McLeod")).toBe("Ana McLeod");
  });

  it("recognizes DNI and NIE shapes", () => {
    expect(isDniShape("30958467F")).toBe(true);
    expect(isDniShape("X1234567L")).toBe(true);
    expect(isDniShape("3095846F")).toBe(false);
    expect(isDniShape("ABCDEFGHI")).toBe(false);
  });

  it("turns Spanish phones into E.164", () => {
    expect(normalizeSpanishPhone("656 31 17 94")).toBe("+34656311794");
    expect(normalizeSpanishPhone("+34 656311794")).toBe("+34656311794");
    expect(normalizeSpanishPhone("0034656311794")).toBe("+34656311794");
    expect(normalizeSpanishPhone("12345")).toBeNull();
  });

  it("reads dates in both orders and rejects impossible ones", () => {
    expect(parseBirthDate("03-09-1982")).toBe("1982-09-03");
    expect(parseBirthDate("3/9/1982")).toBe("1982-09-03");
    expect(parseBirthDate("1982-09-03")).toBe("1982-09-03");
    expect(parseBirthDate("31-02-1982")).toBeNull();
    expect(parseBirthDate("03-09-2999")).toBeNull();
    expect(parseBirthDate("ayer")).toBeNull();
  });

  it("reads the monthly fee in cents", () => {
    expect(parseFeeCents("11.5 €")).toBe(1150);
    expect(parseFeeCents("11,50")).toBe(1150);
    expect(parseFeeCents(12)).toBe(1200);
    expect(parseFeeCents("gratis")).toBeNull();
  });
});

describe("normalizeAffiliatePayload", () => {
  it("normalizes the n8n alta", () => {
    const result = normalizeAffiliatePayload(sample);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      firstName: "María Victoria",
      lastName: "Osuna Gómez",
      dni: "30958467F",
      birthDate: "1982-09-03",
      phoneE164: "+34656311794",
      email: "victoria.osuna.gomez02@gmail.com",
      monthlyFeeCents: 1150,
      sector: "Educación No Universiaria",
      workplace: "IES MARENOSTRUM",
    });
    expect(result.value.address).toMatchObject({ street: "CAPITÁN DEMA", postalCode: "03007", staircase: null });
  });

  it("rejects what is not a valid alta, with every reason", () => {
    const result = normalizeAffiliatePayload({ ...sample, tipoSolicitud: "baja", validoParaProcesar: false, errores: ["x"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(3);
  });

  it("rejects a missing or malformed DNI and non-objects", () => {
    expect(normalizeAffiliatePayload({ ...sample, afiliado: { ...sample.afiliado, dni: "" } }).ok).toBe(false);
    expect(normalizeAffiliatePayload({ ...sample, afiliado: { ...sample.afiliado, dni: "12" } }).ok).toBe(false);
    expect(normalizeAffiliatePayload(null).ok).toBe(false);
    expect(normalizeAffiliatePayload("alta").ok).toBe(false);
  });

  it("normalizes the DNI so a resend matches", () => {
    const result = normalizeAffiliatePayload({ ...sample, afiliado: { ...sample.afiliado, dni: "30.958.467-f" } });
    expect(result.ok && result.value.dni).toBe("30958467F");
  });
});

describe("proposeDelegate", () => {
  const d = (userId: string, assigned: number, pending = 0) => ({ userId, name: userId, assigned, pending });

  it("picks the least loaded, counting pending proposals", () => {
    expect(proposeDelegate([d("a", 5), d("b", 2), d("c", 3)])).toBe("b");
    expect(proposeDelegate([d("a", 2, 0), d("b", 1, 2)])).toBe("a");
  });

  it("breaks ties by the given order", () => {
    expect(proposeDelegate([d("a", 2), d("b", 2)])).toBe("a");
  });

  it("is null without delegates", () => {
    expect(proposeDelegate([])).toBeNull();
  });
});
