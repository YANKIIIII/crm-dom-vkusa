import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination } from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../api';

const AuditLog = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get('/common/audit_logs/')
      .then(res => setLogs(res.data.results || res.data))
      .catch(err => console.error(err));
  }, []);

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Журнал действий</Typography>
      
      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Дата/время</TableCell>
                <TableCell>Пользователь</TableCell>
                <TableCell>Действие</TableCell>
                <TableCell>Тип сущности</TableCell>
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
                  <TableCell sx={{ color: '#1A202C' }}>{row.user || 'Система'}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.action}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.entity_type}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.entity_id}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>
                    {row.details ? JSON.stringify(row.details) : '—'}
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
      </Paper>
    </Box>
  );
};

export default AuditLog;
