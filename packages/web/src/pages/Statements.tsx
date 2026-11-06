import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@wso2/oxygen-ui';
import { useMemo } from 'react';
import { shortDate } from '../format';
import { fileRows } from '../tables';
import { Empty, Section, Title } from '../ui';
import type { PageProps } from './types';

const ACTIONS = { rename: 'Rename', move: 'Move', bin: 'Remove' };
const REASONS = {
  'improper-name': 'the name does not say the bank, account and period',
  'wrong-folder': 'it is in another bank folder',
  duplicate: 'another file has the same rows',
};

export function Statements({ ledger, status, tidy }: PageProps) {
  const { locale } = ledger;
  const files = useMemo(
    () => [...fileRows(ledger)].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    [ledger],
  );

  return (
    <>
      <Title title="Statements" subtitle={`${files.length} files in ${status.dataFolder}`} />
      <Section title="Tidy-up suggestions">
        {tidy.length === 0 ? (
          <Empty>Every file has a tidy name and is in its bank folder.</Empty>
        ) : (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Applying these comes in a later version. For now you can do them by hand.
            </Typography>
            {tidy.map((proposal) => (
              <Box key={proposal.file}>
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                  {`${ACTIONS[proposal.action]} ${proposal.file}${proposal.to ? ` to ${proposal.to}` : ''}`}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {`Because ${REASONS[proposal.reason]}.`}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Section>
      <Section title="Files">
        {files.length === 0 ? (
          <Empty>No statement files in your bank folders yet.</Empty>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>File</TableCell>
                  <TableCell>Bank</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell>Period</TableCell>
                  <TableCell align="right">Rows</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.path}>
                    <TableCell sx={{ wordBreak: 'break-all', minWidth: 220 }}>
                      {file.path}
                      {file.issues.length > 0 ? (
                        <Typography variant="caption" color="text.secondary" component="div">
                          {file.issues.slice(0, 3).join(' ')}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>{file.bankName}</TableCell>
                    <TableCell>{file.accountName}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {file.from && file.to
                        ? `${shortDate(file.from, locale)} to ${shortDate(file.to, locale)}`
                        : ''}
                    </TableCell>
                    <TableCell align="right">{file.rows}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                        {file.status.map((label) => (
                          <Chip
                            key={label}
                            size="small"
                            variant="outlined"
                            label={label}
                            color={
                              label === 'OK'
                                ? 'success'
                                : label === 'Unreadable'
                                  ? 'error'
                                  : 'warning'
                            }
                          />
                        ))}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Section>
    </>
  );
}
