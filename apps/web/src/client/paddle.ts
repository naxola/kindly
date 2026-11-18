'use client'

/**
 * Paddle.js checkout (ADR 0012, 0014). The script is loaded only when someone buys a plan. The
 * server creates the transaction already bound to the organization: the browser only opens
 * it by id and never says whose purchase it is.
 */
interface PaddleJs {
  Environment: { set: (env: 'sandbox') => void }
  Initialize: (options: { token: string }) => void
  Checkout: {
    open: (options: { transactionId: string }) => void
  }
}

export interface CheckoutSession {
  environment: 'sandbox' | 'production'
  clientToken: string
  transactionId: string
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
  paddle.Checkout.open({ transactionId: session.transactionId })
}
