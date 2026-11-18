import type { LinkComponent } from '@saas/ui/shell'
import NextLink from 'next/link'

export const AppLink: LinkComponent = ({ href, ...props }) => <NextLink href={href} {...props} />
