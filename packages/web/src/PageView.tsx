import { Alert, AlertTitle, Link, Stack, Typography } from '@wso2/oxygen-ui';
import { Component, type ComponentType, type ReactNode } from 'react';
import type { PageProps } from './pages/types';
import { hrefFor, type PageId } from './routes';

class PageBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <Alert severity="error">
        <AlertTitle>This page could not be shown.</AlertTitle>
        <Typography variant="body2">{this.state.error.message}</Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <Link href={hrefFor({ page: 'overview' })}>Go to the overview</Link>
          <Link component="button" onClick={() => window.location.reload()}>
            Reload
          </Link>
        </Stack>
      </Alert>
    );
  }
}

export function PageView({
  pages,
  ...props
}: PageProps & { pages: Record<PageId, ComponentType<PageProps>> }) {
  const Page = pages[props.route.page];
  return (
    <PageBoundary key={hrefFor(props.route)}>
      <Page {...props} />
    </PageBoundary>
  );
}
