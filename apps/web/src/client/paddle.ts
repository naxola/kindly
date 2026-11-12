'use client'

/**
 * Paddle.js checkout (ADR 0012). The script is loaded only when someone buys a plan. The
 * organization id travels as customData and Paddle copies it to the subscription, which is
 * how its webhooks find the organization.
 */
interface PaddleJs {
  Environment: { set: (env: 'sandbox') => void }
  Initialize: (options: { token: string }) => void
  Checkout: {
    open: (options: {
      items: { priceId: string; quantity: number }[]
      customer?: { email: string }
      customData?: Record<string, string>
    }) => void
  }
}

export interface CheckoutSession {
  environment: 'sandbox' | 'production'
  clientToken: string
  priceId: string
  customData: Record<string, string>
  customerEmail: string | null
}

const SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js'
let ready: Promise<PaddleJs> | null = null

function load(session: CheckoutSession): Promise<PaddleJs> {
  ready ??= new Promise<PaddleJs>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SRC
    script.async = true
    script.onload = () => {
      const paddle = (window as unknown as { Paddle?: PaddleJs }).Paddle
      if (!paddle) return reject(new Error('Paddle.js did not load'))
      if (session.environment === 'sandbox') paddle.Environment.set('sandbox')
      paddle.Initialize({ token: session.clientToken })
      resolve(paddle)
    }
    script.onerror = () => {
      ready = null
      reject(new Error('Paddle.js could not be loaded'))
    }
    document.head.appendChild(script)
  })
  return ready
}

export async function openPaddleCheckout(session: CheckoutSession) {
  const paddle = await load(session)
  paddle.Checkout.open({
    items: [{ priceId: session.priceId, quantity: 1 }],
    ...(session.customerEmail ? { customer: { email: session.customerEmail } } : {}),
    customData: session.customData,
  })
}
