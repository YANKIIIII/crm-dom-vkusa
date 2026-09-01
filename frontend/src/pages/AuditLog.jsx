import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TablePagination, TextField,
} from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../api';
import { useFeedback } from '../hooks/useFeedback';
import {
  extractApiError, PAGE_SIZE, PAGE_SIZE_OPTIONS, toggleOrdering, buildListQuery,
} from '../utils';
import SortableHeader from '../components/SortableHeader';
import SearchableSelect from '../components/SearchableSelect';
import TruncatedText from '../components/TruncatedText';

const ACTION_OPTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'SYSTEM'];
const ENTITY_OPTIONS = ['order', 'order_item', 'client', 'product_card', 'stock_item', 'user'];

const AuditLog = () => {
  const { notify } = useFeedback();
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [ordering, setOrdering] = useState('-timestamp');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateAfter, setDateAfter] = useState('');
  const [dateBefore, setDateBefore] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(`/common/audit_logs/?${buildListQuery({
      page: page + 1,
      pageSize,
      ordering,
      extra: {
        action,
        entity_type: entityType,
        date_after: dateAfter,
        date_before: dateBefore,
      },
    })}`)
      .then((res) => {
        if (cancelled) return;
        setLogs(res.data.results || res.data);
        setTotalCount(res.data.count || 0);
      })
      .catch((err) => {
        if (!cancelled) notify(`Не удалось загрузить журнал:\n${extractApiError(err)}`, 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, ordering, action, entityType, dateAfter, dateBefore, notify]);

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Журнал действий</Typography>

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ p: 3, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #EDF2F7' }}>
          <Box sx={{ minWidth: 180 }}>
            <SearchableSelect
              id="audit-action"
              label="Действие"
              value={action}
              onChange={(value) => { setAction(value); setPage(0); }}
              options={[{ value: '', label: 'Все' }, ...ACTION_OPTIONS.map((value) => ({ value, label: value }))]}
            />
          </Box>
          <Box sx={{ minWidth: 200 }}>
            <SearchableSelect
              id="audit-entity"
              label="Сущность"
              value={entityType}
              onChange={(value) => { setEntityType(value); setPage(0); }}
              options={[{ value: '', label: 'Все' }, ...ENTITY_OPTIONS.map((value) => ({ value, label: value }))]}
            />
          </Box>
          <TextField
            size="small"
            type="date"
            label="С"
            value={dateAfter}
            onChange={(e) => { setDateAfter(e.target.value); setPage(0); }}
            sx={{ width: 170, minWidth: 170, flexShrink: 0 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            type="date"
            label="По"
            value={dateBefore}
            onChange={(e) => { setDateBefore(e.target.value); setPage(0); }}
            sx={{ width: 170, minWidth: 170, flexShrink: 0 }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <SortableHeader field="timestamp" label="Дата/время" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} defaultDesc />
                <TableCell>Пользователь</TableCell>
                <SortableHeader field="action" label="Действие" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <SortableHeader field="entity_type" label="Тип сущности" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <TableCell>ID сущности</TableCell>
                <TableCell>Детали</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ color: '#4A5568' }}>
                    {row.timestamp ? new Date(row.timestamp).toLocaleString('ru-RU') : '—'}
                  </TableCell>
                  <TableCell sx={{ color: '#1A202C', maxWidth: 180 }}><TruncatedText>{row.user_name || row.user || 'Система'}</TruncatedText></TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.action}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.entity_type}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.entity_id}</TableCell>
                  <TableCell sx={{ color: '#4A5568', maxWidth: 360 }}>
                    <TruncatedText>{row.details ? JSON.stringify(row.details) : '—'}</TruncatedText>
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#718096' }}>Нет записей в журнале</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
        />
      </Paper>
    </Box>
  );
};

export default AuditLog;
