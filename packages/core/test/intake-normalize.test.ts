// Ported from the previous app (tests/unit/affiliate-normalize.test.ts), with fictitious data.
import { describe, expect, it } from 'vitest'
import {
  isDniShape,
  normalizeAffiliatePayload,
  normalizeSpanishPhone,
  parseBirthDate,
  parseFeeCents,
  toDisplayCase,
  proposeDelegate,
} from '../src/index.ts'

const sample = {
  tipoSolicitud: 'alta',
  validoParaProcesar: true,
  errores: [],
  afiliado: {
    nombre: 'MARÍA PRUEBA',
    apellidos: 'EJEMPLO GÓMEZ',
    dni: '12345678Z',
    fechaNacimiento: '03-09-1982',
    genero: 'Mujer',
    telefono: '600111222',
    email: 'Maria.Prueba@Example.test',
    domicilio: {
      tipoVia: 'Calle',
      direccion: 'MAYOR',
      numero: '20',
      escalera: '',
      piso: '4',
      puerta: 'B',
      otros: '',
      pais: 'España',
      codigoPostal: '03007',
      poblacion: 'ALACANT/ALICANTE',
      provincia: 'Alicante-Alacant',
    },
    afiliacion: {
      provincia: 'Alicante-Alacant',
      sector: 'Educación No Universiaria',
      situacionLaboral: 'Activo',
      cuotaMensual: '11.5 €',
      centroTrabajo: 'IES EJEMPLO',
      provinciaTrabajo: 'Alicante-Alacant',
    },
    delegadoId: null,
    situacion: 'alta',
  },
}

describe('field normalizers', () => {
  it('title-cases only all-uppercase names', () => {
    expect(toDisplayCase('MARÍA PRUEBA')).toBe('María Prueba')
    expect(toDisplayCase('DE LA O-GÓMEZ')).toBe('De La O-Gómez')
    expect(toDisplayCase('Ana McLeod')).toBe('Ana McLeod')
  })

  it('recognizes DNI and NIE shapes', () => {
    expect(isDniShape('12345678Z')).toBe(true)
    expect(isDniShape('X1234567L')).toBe(true)
    expect(isDniShape('1234567Z')).toBe(false)
    expect(isDniShape('ABCDEFGHI')).toBe(false)
  })

  it('turns Spanish phones into E.164', () => {
    expect(normalizeSpanishPhone('600 11 12 22')).toBe('+34600111222')
    expect(normalizeSpanishPhone('+34 600111222')).toBe('+34600111222')
    expect(normalizeSpanishPhone('0034600111222')).toBe('+34600111222')
    expect(normalizeSpanishPhone('12345')).toBeNull()
  })

  it('reads dates in both orders and rejects impossible ones', () => {
    expect(parseBirthDate('03-09-1982')).toBe('1982-09-03')
    expect(parseBirthDate('3/9/1982')).toBe('1982-09-03')
    expect(parseBirthDate('1982-09-03')).toBe('1982-09-03')
    expect(parseBirthDate('31-02-1982')).toBeNull()
    expect(parseBirthDate('03-09-2999')).toBeNull()
    expect(parseBirthDate('ayer')).toBeNull()
  })

  it('reads the monthly fee in cents', () => {
    expect(parseFeeCents('11.5 €')).toBe(1150)
    expect(parseFeeCents('11,50')).toBe(1150)
    expect(parseFeeCents(12)).toBe(1200)
    expect(parseFeeCents('gratis')).toBeNull()
  })
})

describe('normalizeAffiliatePayload', () => {
  it('normalizes the n8n alta', () => {
    const result = normalizeAffiliatePayload(sample)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      firstName: 'María Prueba',
      lastName: 'Ejemplo Gómez',
      dni: '12345678Z',
      birthDate: '1982-09-03',
      phoneE164: '+34600111222',
      email: 'maria.prueba@example.test',
      monthlyFeeCents: 1150,
      sector: 'Educación No Universiaria',
      workplace: 'IES EJEMPLO',
    })
    expect(result.value.address).toMatchObject({
      street: 'MAYOR',
      postalCode: '03007',
      staircase: null,
    })
  })

  it('rejects what is not a valid alta, with every reason', () => {
    const result = normalizeAffiliatePayload({
      ...sample,
      tipoSolicitud: 'baja',
      validoParaProcesar: false,
      errores: ['x'],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toHaveLength(3)
  })

  it('rejects a missing or malformed DNI and non-objects', () => {
    expect(
      normalizeAffiliatePayload({ ...sample, afiliado: { ...sample.afiliado, dni: '' } }).ok,
    ).toBe(false)
    expect(
      normalizeAffiliatePayload({ ...sample, afiliado: { ...sample.afiliado, dni: '12' } }).ok,
    ).toBe(false)
    expect(normalizeAffiliatePayload(null).ok).toBe(false)
    expect(normalizeAffiliatePayload('alta').ok).toBe(false)
  })

  it('normalizes the DNI so a resend matches', () => {
    const result = normalizeAffiliatePayload({
      ...sample,
      afiliado: { ...sample.afiliado, dni: '12.345.678-z' },
    })
    expect(result.ok && result.value.dni).toBe('12345678Z')
  })
})

describe('proposeDelegate', () => {
  const d = (memberId: string, assigned: number, pending = 0) => ({
    memberId,
    name: memberId,
    assigned,
    pending,
  })

  it('picks the least loaded, counting pending proposals', () => {
    expect(proposeDelegate([d('a', 5), d('b', 2), d('c', 3)])).toBe('b')
    expect(proposeDelegate([d('a', 2, 0), d('b', 1, 2)])).toBe('a')
  })

  it('breaks ties by the given order', () => {
    expect(proposeDelegate([d('a', 2), d('b', 2)])).toBe('a')
  })

  it('is null without delegates', () => {
    expect(proposeDelegate([])).toBeNull()
  })
})
