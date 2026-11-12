import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-sm font-normal transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'border-brand bg-brand text-brand-foreground hover:bg-brand-hover',
        default: 'border-border-control bg-control text-foreground hover:bg-surface-200',
        outline: 'border-border-strong bg-transparent text-foreground hover:bg-surface-200',
        ghost:
          'border-transparent bg-transparent text-foreground-light hover:bg-surface-200 hover:text-foreground',
        destructive: 'border-destructive bg-destructive text-white hover:opacity-90',
        warning: 'border-warning bg-warning text-white hover:opacity-90',
      },
      size: {
        tiny: 'h-[26px] px-2.5 text-xs',
        small: 'h-8 px-3',
        medium: 'h-9 px-4',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'tiny' },
  },
)

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  )
}
