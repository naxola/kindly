import { describe, expect, it } from 'vitest'
import { invitationEmail, passwordResetEmail, verificationEmail } from '../src/index.ts'

describe('identity email templates', () => {
  it('render the link in text and html, in each locale', () => {
    const es = verificationEmail('es', 'Ana', 'https://app.example.com/v?t=1')
    expect(es.subject).toBe('Confirma tu dirección de correo')
    expect(es.text).toContain('https://app.example.com/v?t=1')
    expect(passwordResetEmail('en', 'Ana', 'https://x.y/r').subject).toBe('Reset your password')
  })

  it('escape names in html (no injection through the organization name)', () => {
    const email = invitationEmail('es', '<script>x</script>', 'Ana', 'https://x.y/i', 7)
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })
})
