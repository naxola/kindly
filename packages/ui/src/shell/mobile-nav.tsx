'use client'

import { Dialog as Primitive } from 'radix-ui'
import { Menu } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../lib/cn.ts'
import { ProductMenu } from './product-menu.tsx'
import type { LinkComponent, ProductMenuConfig, RailItem } from './types.ts'

/** On mobile, the rail and the product menu are grouped in a left drawer. */
export function MobileNav({
  groups,
  activeKey,
  productMenu,
  activeHref,
  Link,
  openLabel,
  title,
}: {
  groups: RailItem[][]
  activeKey?: string
  productMenu?: ProductMenuConfig
  activeHref?: string
  Link: LinkComponent
  openLabel: string
  title: string
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <Primitive.Root open={open} onOpenChange={setOpen}>
      <Primitive.Trigger
        aria-label={openLabel}
        className="rounded-md p-1.5 text-foreground-light hover:bg-surface-200"
      >
        <Menu className="size-4" />
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Primitive.Content className="fixed inset-y-0 left-0 z-40 flex w-[min(20rem,85vw)] flex-col overflow-y-auto border-r border-border-strong bg-background-alt data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
          <Primitive.Title className="sr-only">{title}</Primitive.Title>
          <ul className="flex flex-col gap-0.5 border-b border-border p-2">
            {groups.flat().map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={item.key === activeKey ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-3 rounded-md px-2.5 text-sm [&_svg]:size-4',
                    item.key === activeKey
                      ? 'bg-selection text-foreground'
                      : 'text-foreground-light hover:bg-surface-200',
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          {productMenu ? (
            <ProductMenu
              config={productMenu}
              activeHref={activeHref}
              Link={Link}
              onNavigate={close}
              className="flex w-full border-r-0"
            />
          ) : null}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
