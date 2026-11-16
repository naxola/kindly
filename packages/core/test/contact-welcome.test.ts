import { describe, expect, it } from 'vitest'
import { welcomeEmail } from '../src/index.ts'

const base = {
  contactName: 'Marta Gil',
  organizationName: 'Sindicato Norte',
  delegate: { name: 'Luis Pérez', email: 'luis@norte.test', phone: '+34600111222' },
}

describe('welcome email to a contact', () => {
  it('introduces the delegate with email and phone, in the organization language', () => {
    const es = welcomeEmail({ ...base, locale: 'es' })
    expect(es.subject).toBe('Bienvenida a Sindicato Norte')
    expect(es.text).toContain('Hola, Marta Gil:')
    expect(es.text).toContain('Luis Pérez será tu persona de referencia')
    expect(es.text).toContain('Email: luis@norte.test')
    expect(es.text).toContain('Teléfono: +34600111222')
    expect(es.html).toContain('href="mailto:luis@norte.test"')
    expect(es.html).toContain('href="tel:+34600111222"')
    const en = welcomeEmail({ ...base, locale: 'en' })
    expect(en.subject).toBe('Welcome to Sindicato Norte')
    expect(en.text).toContain('Phone: +34600111222')
  })

  it('leaves out what the delegate has not filled in', () => {
    const r = welcomeEmail({
      ...base,
      locale: 'es',
      delegate: { name: 'Luis Pérez', email: null, phone: null },
    })
    expect(r.text).not.toContain('Teléfono')
    expect(r.text).not.toContain('Email:')
    expect(r.html).not.toContain('mailto:')
    expect(r.text).toContain('Nombre: Luis Pérez')
  })

  it('escapes names in the HTML', () => {
    const r = welcomeEmail({ ...base, locale: 'es', contactName: '<script>x</script>' })
    expect(r.html).not.toContain('<script>')
    expect(r.html).toContain('&lt;script&gt;')
  })
})
