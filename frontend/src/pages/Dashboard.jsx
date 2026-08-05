import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Grid, Card, CardContent, CircularProgress, Alert, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useTheme
} from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import api from '../api';
import { formatCurrency } from '../utils';

const COLORS = ['#CC5E33', '#2F80ED', '#FFBB28', '#00C49F', '#8884d8'];

const StatCard = ({ title, value, prefix = '', suffix = '' }) => (
  <Card sx={{ 
    height: '100%', 
    background: '#FFFFFF',
    borderRadius: 4,
    border: '1px solid #EDF2F7',
    boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.05)',
    transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
    '&:hover': {
      transform: 'translateY(-4px)',
      boxShadow: '0px 8px 25px rgba(0, 0, 0, 0.1)',
    }
  }}>
    <CardContent sx={{ p: 3 }}>
      <Typography color="text.secondary" gutterBottom variant="subtitle2" fontWeight="600" textTransform="uppercase">
        {title}
      </Typography>
      <Typography variant="h4" component="div" fontWeight="700" sx={{ color: 'primary.main', mt: 1 }}>
        {prefix}{value}{suffix}
      </Typography>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await api.get('/analytics/sales/');
        setData(response.data);
        setLoading(false);
      } catch (err) {
        setError('Не удалось загрузить данные аналитики. Пожалуйста, проверьте подключение к серверу.');
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
      <CircularProgress color="primary" />
    </Box>
  );

  if (error) return (
    <Box p={3}>
      <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
    </Box>
  );
  if (!data) return null;

  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
      <Typography variant="h4" gutterBottom fontWeight="700" sx={{ mb: 4, color: 'text.primary' }}>
        Аналитика и Дашборд
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard 
            title="Общая выручка" 
            value={data.total_revenue ? formatCurrency(data.total_revenue) : '0 BYN'} 
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard 
            title="Выполнено заказов" 
            value={data.total_completed_orders || 0} 
          />
        </Grid>
        <Grid item xs={12} sm={12} md={4}>
          <StatCard 
            title="Средний чек" 
            value={data.total_completed_orders ? formatCurrency(Math.round(data.total_revenue / data.total_completed_orders)) : '0 BYN'} 
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: 450, display: 'flex', flexDirection: 'column', borderRadius: 4, boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.03)' }}>
            <Typography variant="h6" gutterBottom fontWeight="600" sx={{ mb: 3 }}>
              Динамика выручки (30 дней)
            </Typography>
            <Box sx={{ flexGrow: 1, minHeight: 0 }}>
              {data.daily_revenue && data.daily_revenue.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily_revenue} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF2F7" />
                    <XAxis 
                      dataKey="date" 
                      tick={{fontSize: 12, fill: theme.palette.text.secondary}} 
                      axisLine={false} 
                      tickLine={false}
                      tickFormatter={(str) => {
                        const date = new Date(str);
                        return `${date.getDate()}.${date.getMonth() + 1}`;
                      }}
                    />
                    <YAxis 
                      tick={{fontSize: 12, fill: theme.palette.text.secondary}} 
                      axisLine={false} 
                      tickLine={false}
                      tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                    />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                      formatter={(value) => [formatCurrency(value), 'Выручка']}
                      labelFormatter={(label) => `Дата: ${label}`}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke={theme.palette.primary.main} 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: theme.palette.primary.main, strokeWidth: 2, stroke: '#fff' }} 
                      activeDot={{ r: 8, strokeWidth: 0 }} 
                      animationDuration={1500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                  <Typography color="text.secondary">Нет данных для графика</Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: 450, display: 'flex', flexDirection: 'column', borderRadius: 4, boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.03)' }}>
            <Typography variant="h6" gutterBottom fontWeight="600" sx={{ mb: 3 }}>
              Заказы по статусам
            </Typography>
            <Box sx={{ flexGrow: 1, minHeight: 0 }}>
              {data.orders_by_status && data.orders_by_status.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.orders_by_status}
                      cx="50%"
                      cy="45%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="count"
                      nameKey="name"
                      stroke="none"
                      animationDuration={1000}
                    >
                      {data.orders_by_status.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '13px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                  <Typography color="text.secondary">Нет данных</Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 3, borderRadius: 4, boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.03)' }}>
            <Typography variant="h6" gutterBottom fontWeight="600" sx={{ mb: 3 }}>
              Популярные товары (Топ 5)
            </Typography>
            {data.popular_items && data.popular_items.length > 0 ? (
              <TableContainer>
                <Table sx={{ minWidth: 500 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: '600', color: 'text.secondary' }}>Наименование товара</TableCell>
                      <TableCell align="right" sx={{ fontWeight: '600', color: 'text.secondary' }}>Продано (шт.)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.popular_items.map((row, index) => (
                      <TableRow 
                        key={index} 
                        sx={{ 
                          '&:last-child td, &:last-child th': { border: 0 },
                          '&:hover': { backgroundColor: 'rgba(0,0,0,0.01)' }
                        }}
                      >
                        <TableCell component="th" scope="row">
                          <Box display="flex" alignItems="center">
                            <Box 
                              sx={{ 
                                width: 8, 
                                height: 8, 
                                borderRadius: '50%', 
                                backgroundColor: COLORS[index % COLORS.length],
                                mr: 2
                              }} 
                            />
                            <Typography fontWeight="500">{row.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight="600" color="primary.main">
                            {row.total_sold}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography color="text.secondary" sx={{ py: 2 }}>
                Нет проданных товаров за этот период.
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
