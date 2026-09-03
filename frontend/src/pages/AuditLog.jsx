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

const ACTION_LABELS = {
  CREATE: 'Создан',
  UPDATE: 'Изменён',
  DELETE: 'Удалён',
  LOGIN: 'Вход',
  LOGOUT: 'Выход',
  SYSTEM: 'Система',
};
const ENTITY_LABELS = {
  order: 'Заказ',
  order_item: 'Позиция заказа',
  client: 'Клиент',
  task_card: 'Задача',
  product_card: 'Товар',
  stock_item: 'Склад',
  user: 'Пользователь',
  personnel_profile: 'Профиль сотрудника',
  personnel_month: 'Зарплата за месяц',
  personnel_leave: 'Отпуск / отгул',
};
const ACTION_OPTIONS = Object.keys(ACTION_LABELS);
const ENTITY_OPTIONS = Object.keys(ENTITY_LABELS);

const DETAIL_KEYS = {
  status: 'Статус',
  username: 'Логин',
  ip_address: 'IP-адрес',
  event: 'Событие',
  stock_quantity: 'Кол-во на складе',
  receipt: 'Приход',
  old_status: 'Старый статус',
  new_status: 'Новый статус',
  items_deleted: 'Удалено товаров',
  payments_deleted: 'Удалено оплат',
  deliveries_deleted: 'Удалено доставок',
  order_id: 'ID заказа',
  quantity: 'Количество',
  new: 'Новое значение',
  old: 'Старое значение',
};

const DETAIL_VALUES = {
  success: 'Успешно',
  failure: 'Ошибка',
  password_change: 'Смена пароля',
  stock_deducted: 'Списание со склада',
  stock_restored: 'Возврат на склад',
  stock_receipt: 'Приход на склад',
  reserved: 'Резерв',
  confirmed: 'Подтвержден',
  in_delivery: 'В доставке',
  completed: 'Завершен',
  cancelled: 'Отменен',
};

const formatDetails = (details) => {
  if (!details || (typeof details === 'object' && Object.keys(details).length === 0)) return '—';
  
  if (typeof details === 'object') {
    return Object.entries(details)
      .map(([key, value]) => {
        const label = DETAIL_KEYS[key] || key;
        
        let formattedValue;
        if (typeof value === 'object' && value !== null) {
          formattedValue = `{ ${formatDetails(value)} }`;
        } else {
          formattedValue = DETAIL_VALUES[value] || value;
        }
        
        return `${label}: ${formattedValue}`;
      })
      .join(', ');
  }
  
  return DETAIL_VALUES[details] || String(details);
};

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(extractApiError(err));
          notify(`Не удалось загрузить журнал:\n${extractApiError(err)}`, 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
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
              options={[{ value: '', label: 'Все' }, ...ACTION_OPTIONS.map((value) => ({ value, label: ACTION_LABELS[value] }))]}
            />
          </Box>
          <Box sx={{ minWidth: 200 }}>
            <SearchableSelect
              id="audit-entity"
              label="Сущность"
              value={entityType}
              onChange={(value) => { setEntityType(value); setPage(0); }}
              options={[{ value: '', label: 'Все' }, ...ENTITY_OPTIONS.map((value) => ({ value, label: ENTITY_LABELS[value] }))]}
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#718096' }}>Загрузка…</TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#E53E3E' }}>
                    Не удалось загрузить журнал
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#718096' }}>Нет записей в журнале</TableCell>
                </TableRow>
              ) : logs.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ color: '#4A5568' }}>
                    {row.timestamp ? new Date(row.timestamp).toLocaleString('ru-RU') : '—'}
                  </TableCell>
                  <TableCell sx={{ color: '#1A202C', maxWidth: 180 }}><TruncatedText>{row.user_name || row.user || 'Система'}</TruncatedText></TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{ACTION_LABELS[row.action] || row.action}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{ENTITY_LABELS[row.entity_type] || row.entity_type}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.entity_id}</TableCell>
                  <TableCell sx={{ color: '#4A5568', maxWidth: 360 }}>
                    <TruncatedText>{formatDetails(row.details)}</TruncatedText>
                  </TableCell>
                </TableRow>
              ))}
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
