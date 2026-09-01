import { Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, Dialog, DialogTitle, DialogContent, DialogActions, TextField, CircularProgress, Alert, IconButton, Tooltip } from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../api';
import { useFeedback } from '../hooks/useFeedback';
import { extractApiError, PAGE_SIZE, PAGE_SIZE_OPTIONS, toggleOrdering, buildListQuery } from '../utils';
import SortableHeader from '../components/SortableHeader';
import SearchableSelect from '../components/SearchableSelect';
import TruncatedText from '../components/TruncatedText';

const ROLE_LABELS = {
  seller: 'Продавец',
  manager: 'Руководитель',
};

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  username: '',
  password: '',
  role: 'seller',
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU');
};

const fullName = (row) => (
  `${row.last_name || ''} ${row.first_name || ''}`.trim() || row.username || '—'
);

const Users = () => {
  const { notify, confirm } = useFeedback();
  const [users, setUsers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [ordering, setOrdering] = useState('id');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.get(`/users/users/?${buildListQuery({
      page: page + 1,
      pageSize,
      ordering,
    })}`)
      .then((response) => {
        if (!cancelled) {
          setUsers(response.data.results || response.data);
          setTotalCount(response.data.count || 0);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          notify(`Не удалось загрузить пользователей:\n${extractApiError(error)}`, 'error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [notify, page, pageSize, ordering, listVersion]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setOpenModal(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setFormData({
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      email: row.email || '',
      username: row.username || '',
      password: '',
      role: row.role || 'seller',
    });
    setFormError(null);
    setOpenModal(true);
  };

  const handleSaveUser = async () => {
    setLoading(true);
    setFormError(null);
    const payload = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      email: formData.email,
      username: formData.username,
      role: formData.role,
    };
    if (formData.password) payload.password = formData.password;
    try {
      if (editingId) {
        await api.patch(`/users/users/${editingId}/`, payload);
      } else {
        if (!formData.password) {
          setFormError('Укажите пароль');
          setLoading(false);
          return;
        }
        await api.post('/users/users/', payload);
      }
      setOpenModal(false);
      setListVersion((v) => v + 1);
    } catch (error) {
      setFormError(`Не удалось сохранить пользователя: ${extractApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (row) => {
    if (!(await confirm(`Удалить пользователя ${row.username}?`))) return;
    setDeletingId(row.id);
    try {
      await api.delete(`/users/users/${row.id}/`);
      setListVersion((v) => v + 1);
    } catch (error) {
      notify(`Не удалось удалить пользователя:\n${extractApiError(error)}`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4">Пользователи</Typography>
        <Button variant="contained" color="primary" onClick={openCreate}>
          НОВЫЙ ПОЛЬЗОВАТЕЛЬ +
        </Button>
      </Box>

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <SortableHeader field="id" label="ID" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <SortableHeader field="last_name" label="ФИО" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <SortableHeader field="username" label="Логин" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <SortableHeader field="role" label="Роль" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <SortableHeader field="is_active" label="Активен" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <SortableHeader field="last_login" label="Последний вход" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} defaultDesc />
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((row) => (
                <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => openEdit(row)}>
                  <TableCell sx={{ color: '#4A5568' }}>{row.id}</TableCell>
                  <TableCell sx={{ color: '#1A202C', maxWidth: 220 }}><TruncatedText>{fullName(row)}</TruncatedText></TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.username}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{ROLE_LABELS[row.role] || row.role}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.is_active ? 'Да' : 'Нет'}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{formatDateTime(row.last_login)}</TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Удалить пользователя">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Удалить пользователя ${row.username}`}
                          disabled={deletingId === row.id}
                          onClick={() => handleDelete(row)}
                        >
                          <span className="material-icons" style={{ fontSize: 20 }} aria-hidden="true">
                            delete
                          </span>
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#718096' }}>Нет пользователей</TableCell>
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

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Редактирование пользователя' : 'Создание пользователя'}</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {formError && (
            <Alert severity="error" role="alert" aria-live="assertive">
              {formError}
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField fullWidth label="Имя" name="first_name" value={formData.first_name} onChange={handleInputChange} />
            <TextField fullWidth label="Фамилия" name="last_name" value={formData.last_name} onChange={handleInputChange} />
          </Box>
          <TextField fullWidth label="Email" name="email" value={formData.email} onChange={handleInputChange} />
          <TextField fullWidth label="Логин" name="username" value={formData.username} onChange={handleInputChange} />
          <TextField
            fullWidth
            label={editingId ? 'Новый пароль (необязательно)' : 'Пароль'}
            name="password"
            type="password"
            value={formData.password}
            onChange={handleInputChange}
          />
          <SearchableSelect
            id="user-role"
            label="Роль"
            required
            value={formData.role}
            onChange={(value) => setFormData((prev) => ({ ...prev, role: value }))}
            options={[
              { value: 'seller', label: 'Продавец' },
              { value: 'manager', label: 'Руководитель' },
            ]}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)} color="inherit">Отмена</Button>
          <Button onClick={handleSaveUser} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : (editingId ? 'Сохранить' : 'Создать')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;
