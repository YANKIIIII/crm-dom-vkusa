import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { styled, useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';
import { mangoFusionPalette } from '@mui/x-charts/colorPalettes';
import { useDrawingArea } from '@mui/x-charts/hooks';
import api from '../api';
import { extractApiError, formatCurrency } from '../utils';

const CHART_LOCALE = {
  loading: 'Загрузка…',
  noData: 'Нет данных за период',
};

const dateFilterSx = {
  width: 170,
  minWidth: 170,
  '& input': { color: '#1A202C' },
  '& input::-webkit-calendar-picker-indicator': { cursor: 'pointer', opacity: 1 },
};

const cardSx = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid',
  borderColor: 'divider',
};

const pad2 = (value) => String(value).padStart(2, '0');

const formatLocalDate = (date) => (
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
);

const currentMonthRange = () => {
  const now = new Date();
  return {
    date_from: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    date_to: formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

const rangeForPreset = (preset) => {
  const now = new Date();
  const today = formatLocalDate(now);
  if (preset === 'today') {
    return { date_from: today, date_to: today };
  }
  if (preset === 'week') {
    const from = new Date(now);
    from.setDate(now.getDate() - 6);
    return { date_from: formatLocalDate(from), date_to: today };
  }
  if (preset === 'quarter') {
    const quarterStart = Math.floor(now.getMonth() / 3) * 3;
    return {
      date_from: formatLocalDate(new Date(now.getFullYear(), quarterStart, 1)),
      date_to: formatLocalDate(new Date(now.getFullYear(), quarterStart + 3, 0)),
    };
  }
  if (preset === 'year') {
    return {
      date_from: formatLocalDate(new Date(now.getFullYear(), 0, 1)),
      date_to: formatLocalDate(new Date(now.getFullYear(), 11, 31)),
    };
  }
  return currentMonthRange();
};

const PERIOD_PRESETS = [
  { id: 'month', label: 'Текущий месяц' },
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: '7 дней' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'year', label: 'Год' },
  { id: 'custom', label: 'Свой период' },
];

const formatIsoDate = (iso) => {
  if (!iso) return '';
  const [year, month, day] = String(iso).split('-');
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatPercent = (value) => `${toNumber(value).toFixed(1)}%`;

const formatQty = (value) => new Intl.NumberFormat('ru-RU').format(toNumber(value));

const PieLabelPrimary = styled('text')(({ theme }) => ({
  fill: theme.palette.text.primary,
  textAnchor: 'middle',
  dominantBaseline: 'central',
  fontSize: 16,
  fontWeight: 700,
}));

const PieLabelSecondary = styled('text')(({ theme }) => ({
  fill: theme.palette.text.secondary,
  textAnchor: 'middle',
  dominantBaseline: 'central',
  fontSize: 12,
}));

const PieCenterLabel = ({ primary, secondary }) => {
  const { width, height, left, top } = useDrawingArea();
  const x = left + width / 2;
  const y = top + height / 2;
  return (
    <>
      <PieLabelPrimary x={x} y={y - 10}>{primary}</PieLabelPrimary>
      <PieLabelSecondary x={x} y={y + 12}>{secondary}</PieLabelSecondary>
    </>
  );
};

const EmptyHint = ({ children, minHeight = 280 }) => (
  <Box
    sx={{
      minHeight,
      flexGrow: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Typography color="text.secondary">{children}</Typography>
  </Box>
);

const SectionTitle = ({ children }) => (
  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
    {children}
  </Typography>
);

const StatCard = ({ title, value, hint, sparkData, sparkFormatter }) => {
  const theme = useTheme();
  return (
    <Card sx={cardSx}>
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
        <Typography
          variant="subtitle2"
          sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase' }}
        >
          {title}
        </Typography>
        <Typography variant="h4" component="div" sx={{ fontWeight: 700, color: 'primary.main', mt: 1 }}>
          {value}
        </Typography>
        {hint ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {hint}
          </Typography>
        ) : null}
        {sparkData?.length > 1 ? (
          <Box sx={{ width: '100%', height: 56, mt: 1.5 }}>
            <SparkLineChart
              data={sparkData}
              height={56}
              area
              showHighlight
              showTooltip
              color={theme.palette.primary.main}
              valueFormatter={sparkFormatter}
            />
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
};

const GaugeCard = ({ title, value, hint }) => {
  const theme = useTheme();
  const numeric = toNumber(value);
  const valueMax = Math.max(100, Math.ceil(Math.abs(numeric) / 50) * 50 || 100);
  return (
    <Card sx={cardSx}>
      <CardContent sx={{ p: 3, '&:last-child': { pb: 2 } }}>
        <Typography
          variant="subtitle2"
          sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase' }}
        >
          {title}
        </Typography>
        <Gauge
          value={numeric}
          valueMin={numeric < 0 ? Math.min(-100, numeric) : 0}
          valueMax={valueMax}
          startAngle={-110}
          endAngle={110}
          height={140}
          cornerRadius="50%"
          text={({ value: current }) => formatPercent(current)}
          sx={{
            mt: 1,
            [`& .${gaugeClasses.valueArc}`]: { fill: theme.palette.primary.main },
            [`& .${gaugeClasses.referenceArc}`]: { fill: theme.palette.divider },
            [`& .${gaugeClasses.valueText}`]: {
              fontSize: 18,
              fontWeight: 700,
              fill: theme.palette.text.primary,
            },
          }}
        />
        {hint ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
            {hint}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
};

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(currentMonthRange);
  const [appliedRange, setAppliedRange] = useState(currentMonthRange);

  useEffect(() => {
    let cancelled = false;
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const response = await api.get('/analytics/sales/', { params: appliedRange });
        if (cancelled) return;
        setData(response.data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(extractApiError(err, 'Не удалось загрузить данные аналитики.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAnalytics();
    return () => {
      cancelled = true;
    };
  }, [appliedRange]);

  const applyPreset = (nextPreset) => {
    setPreset(nextPreset);
    if (nextPreset === 'custom') return;
    const nextRange = rangeForPreset(nextPreset);
    setRange(nextRange);
    setAppliedRange(nextRange);
  };

  const categories = useMemo(
    () => (data?.sales_by_category || []).map((row) => ({
      name: row.name || 'Без категории',
      quantity: toNumber(row.quantity),
      revenue: toNumber(row.revenue),
    })),
    [data],
  );

  const channels = useMemo(
    () => (data?.sales_by_channel || []).map((row, index) => ({
      id: index,
      label: row.name || 'Без канала',
      value: toNumber(row.revenue),
    })),
    [data],
  );

  const sellersChart = useMemo(
    () => (data?.top_sellers || []).slice(0, 8).map((row) => ({
      name: row.name || 'Без продавца',
      revenue: toNumber(row.revenue),
    })),
    [data],
  );

  const statusChart = useMemo(
    () => (data?.orders_by_status || [])
      .map((row) => ({
        id: row.status_code || row.name,
        label: row.name || row.status_code,
        value: toNumber(row.count),
      }))
      .filter((row) => row.value > 0),
    [data],
  );

  const popularItems = useMemo(
    () => (data?.popular_items || []).map((row) => ({
      name: row.name || 'Без названия',
      total_sold: toNumber(row.total_sold),
    })),
    [data],
  );

  const revenueSpark = useMemo(
    () => (data?.daily_revenue || []).map((row) => toNumber(row.revenue)),
    [data],
  );

  const channelTotal = useMemo(
    () => channels.reduce((sum, row) => sum + row.value, 0),
    [channels],
  );

  const periodLabel = `${formatIsoDate(appliedRange.date_from)} — ${formatIsoDate(appliedRange.date_to)}`;

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 1 }}>Аналитика</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Завершённые сделки за период {periodLabel}
      </Typography>

      <Card sx={{ ...cardSx, mb: 3, height: 'auto' }}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Stack spacing={2}>
            <ToggleButtonGroup
              exclusive
              size="small"
              color="primary"
              value={preset}
              onChange={(_event, next) => {
                if (next) applyPreset(next);
              }}
              aria-label="Пресет периода"
              sx={{
                flexWrap: 'wrap',
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  px: 1.75,
                  fontWeight: 600,
                },
              }}
            >
              {PERIOD_PRESETS.map((item) => (
                <ToggleButton key={item.id} value={item.id}>
                  {item.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              alignItems={{ xs: 'stretch', sm: 'center' }}
            >
              <TextField
                size="small"
                type="date"
                label="Дата от"
                value={range.date_from}
                onChange={(e) => {
                  setPreset('custom');
                  setRange((prev) => ({ ...prev, date_from: e.target.value }));
                }}
                sx={dateFilterSx}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                size="small"
                type="date"
                label="Дата до"
                value={range.date_to}
                onChange={(e) => {
                  setPreset('custom');
                  setRange((prev) => ({ ...prev, date_to: e.target.value }));
                }}
                sx={dateFilterSx}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              {preset === 'custom' ? (
                <Button
                  variant="contained"
                  onClick={() => setAppliedRange(range)}
                  disabled={loading || !range.date_from || !range.date_to}
                >
                  Применить
                </Button>
              ) : null}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {error ? (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      ) : null}

      {loading && !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress color="primary" />
        </Box>
      ) : null}

      {data ? (
        <Box sx={{ position: 'relative' }}>
          {loading ? (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                bgcolor: 'rgba(245, 247, 250, 0.65)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 2,
              }}
            >
              <CircularProgress color="primary" />
            </Box>
          ) : null}

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <StatCard
                title="Выручка"
                value={formatCurrency(data.total_revenue || 0)}
                sparkData={revenueSpark}
                sparkFormatter={(value) => formatCurrency(value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <StatCard title="Количество сделок" value={data.total_completed_orders || 0} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <StatCard title="Средний чек" value={formatCurrency(data.average_check || 0)} />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={cardSx}>
                <CardContent sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <SectionTitle>Заказы по статусам</SectionTitle>
                  {statusChart.length > 0 ? (
                    <Box sx={{ width: '100%' }}>
                      <PieChart
                        colors={mangoFusionPalette}
                        localeText={CHART_LOCALE}
                        series={[{
                          data: statusChart,
                          innerRadius: 50,
                          outerRadius: 100,
                          paddingAngle: 2,
                          cornerRadius: 4,
                          highlightScope: { fade: 'global', highlight: 'item' },
                          valueFormatter: (item) => `${item.value} шт.`,
                        }]}
                        height={280}
                        margin={{ top: 8, bottom: 8 }}
                        hideLegend={false}
                      />
                    </Box>
                  ) : (
                    <EmptyHint>Нет заказов для разбивки по статусам</EmptyHint>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={cardSx}>
                <CardContent sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <SectionTitle>Топ товаров</SectionTitle>
                  {popularItems.length > 0 ? (
                    <Box sx={{ width: '100%' }}>
                      <BarChart
                        dataset={popularItems}
                        colors={mangoFusionPalette}
                        localeText={CHART_LOCALE}
                        layout="horizontal"
                        yAxis={[{
                          scaleType: 'band',
                          dataKey: 'name',
                          width: 'auto',
                        }]}
                        series={[{
                          dataKey: 'total_sold',
                          label: 'Продано, шт.',
                          valueFormatter: (value) => `${formatQty(value)} шт.`,
                        }]}
                        height={Math.max(200, popularItems.length * 44)}
                        margin={{ left: 4, right: 16, top: 8, bottom: 8 }}
                        grid={{ vertical: true }}
                        borderRadius={6}
                        hideLegend
                      />
                    </Box>
                  ) : (
                    <EmptyHint>Нет продаж товаров за период</EmptyHint>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 7 }}>
              <Card sx={cardSx}>
                <CardContent sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <SectionTitle>Продажи по категориям</SectionTitle>
                  {categories.length > 0 ? (
                    <Box sx={{ width: '100%' }}>
                      <BarChart
                        dataset={categories}
                        colors={mangoFusionPalette}
                        localeText={CHART_LOCALE}
                        xAxis={[{
                          scaleType: 'band',
                          dataKey: 'name',
                          height: 64,
                          tickLabelStyle: { fontSize: 11, angle: -25, textAnchor: 'end' },
                        }]}
                        yAxis={[
                          {
                            id: 'revenue',
                            width: 72,
                            valueFormatter: (value) => (value == null ? '' : formatCurrency(value)),
                          },
                          {
                            id: 'quantity',
                            position: 'right',
                            width: 48,
                          },
                        ]}
                        series={[
                          {
                            dataKey: 'revenue',
                            label: 'Сумма',
                            yAxisId: 'revenue',
                            valueFormatter: (value) => formatCurrency(value),
                          },
                          {
                            dataKey: 'quantity',
                            label: 'Количество, шт.',
                            yAxisId: 'quantity',
                            valueFormatter: (value) => `${formatQty(value)} шт.`,
                          },
                        ]}
                        height={280}
                        margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
                        grid={{ horizontal: true }}
                        borderRadius={6}
                      />
                    </Box>
                  ) : (
                    <EmptyHint>Нет продаж по категориям за период</EmptyHint>
                  )}
                  {categories.length > 0 ? (
                    <TableContainer sx={{ mt: 1 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Категория</TableCell>
                            <TableCell align="right">Количество, шт.</TableCell>
                            <TableCell align="right">Сумма</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {categories.map((row) => (
                            <TableRow key={row.name}>
                              <TableCell>{row.name}</TableCell>
                              <TableCell align="right">{formatQty(row.quantity)}</TableCell>
                              <TableCell align="right">{formatCurrency(row.revenue)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : null}
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 5 }}>
              <Card sx={cardSx}>
                <CardContent sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <SectionTitle>Каналы продаж</SectionTitle>
                  {channelTotal > 0 ? (
                    <Box sx={{ width: '100%' }}>
                      <PieChart
                        colors={mangoFusionPalette}
                        localeText={CHART_LOCALE}
                        series={[{
                          data: channels,
                          innerRadius: 60,
                          outerRadius: 100,
                          paddingAngle: 2,
                          cornerRadius: 4,
                          highlightScope: { fade: 'global', highlight: 'item' },
                          valueFormatter: (item) => formatCurrency(item.value),
                        }]}
                        height={280}
                        margin={{ top: 8, bottom: 8 }}
                        hideLegend={false}
                      >
                        <PieCenterLabel primary={formatCurrency(channelTotal)} secondary="выручка" />
                      </PieChart>
                    </Box>
                  ) : (
                    <EmptyHint>Нет продаж по каналам за период</EmptyHint>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 7 }}>
              <Card sx={cardSx}>
                <CardContent sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <SectionTitle>ТОП продавцов</SectionTitle>
                  {sellersChart.length > 0 ? (
                    <Box sx={{ width: '100%' }}>
                      <BarChart
                        dataset={sellersChart}
                        colors={mangoFusionPalette}
                        localeText={CHART_LOCALE}
                        layout="horizontal"
                        yAxis={[{
                          scaleType: 'band',
                          dataKey: 'name',
                          width: 'auto',
                        }]}
                        series={[{
                          dataKey: 'revenue',
                          label: 'Выручка',
                          valueFormatter: (value) => formatCurrency(value),
                        }]}
                        height={Math.max(200, sellersChart.length * 40)}
                        margin={{ left: 4, right: 16, top: 8, bottom: 8 }}
                        grid={{ vertical: true }}
                        borderRadius={6}
                        hideLegend
                      />
                    </Box>
                  ) : (
                    <EmptyHint>Нет завершённых сделок за период</EmptyHint>
                  )}
                  {data.top_sellers?.length > 0 ? (
                    <TableContainer sx={{ mt: 1 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Продавец</TableCell>
                            <TableCell align="right">Сделки</TableCell>
                            <TableCell align="right">Выручка</TableCell>
                            <TableCell align="right">Валовая прибыль</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {data.top_sellers.map((row) => (
                            <TableRow key={row.seller_id ?? row.name}>
                              <TableCell>{row.name || 'Без продавца'}</TableCell>
                              <TableCell align="right">{row.deals}</TableCell>
                              <TableCell align="right">{formatCurrency(row.revenue)}</TableCell>
                              <TableCell align="right">{formatCurrency(row.gross_profit)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : null}
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 5 }}>
              <Card sx={cardSx}>
                <CardContent sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <SectionTitle>Товары с низким остатком</SectionTitle>
                  {data.low_stock?.length > 0 ? (
                    <List dense sx={{ overflow: 'auto', maxHeight: 360, mx: -1 }}>
                      {data.low_stock.map((row) => (
                        <ListItem
                          key={row.id}
                          sx={{
                            bgcolor: '#FFFBEB',
                            borderRadius: 1,
                            mb: 1,
                            alignItems: 'flex-start',
                          }}
                          secondaryAction={(
                            <Chip
                              label="Товар заканчивается"
                              size="small"
                              sx={{ bgcolor: '#FEEBC8', color: '#DD6B20', fontWeight: 600 }}
                            />
                          )}
                        >
                          <ListItemText
                            primary={row.name}
                            secondary={`${row.sku || '—'} · остаток ${formatQty(row.stock_quantity)} · мин. ${formatQty(row.min_stock)}`}
                            slotProps={{
                              primary: { sx: { pr: 18, fontWeight: 500 } },
                              secondary: { sx: { pr: 18 } },
                            }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <EmptyHint>Нет товаров с тегом «Товар заканчивается»</EmptyHint>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard title="Новые клиенты" value={data.new_clients || 0} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Валовая прибыль"
                value={formatCurrency(data.gross_profit || 0)}
                hint="Выручка − себестоимость"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <GaugeCard
                title="Маржинальность"
                value={data.margin_percent}
                hint="Прибыль / выручка"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <GaugeCard
                title="Наценка"
                value={data.markup_percent}
                hint="Прибыль / себестоимость"
              />
            </Grid>

            <Grid size={12}>
              <Card sx={cardSx}>
                <CardContent sx={{ p: 3 }}>
                  <SectionTitle>Аналитика по поставщикам</SectionTitle>
                  {data.sales_by_supplier?.length > 0 ? (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Поставщик</TableCell>
                            <TableCell align="right">Кол-во, шт.</TableCell>
                            <TableCell align="right">Выручка</TableCell>
                            <TableCell align="right">Себестоимость</TableCell>
                            <TableCell align="right">Валовая прибыль</TableCell>
                            <TableCell align="right">Средняя наценка</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {data.sales_by_supplier.map((row) => (
                            <TableRow key={row.name}>
                              <TableCell>{row.name}</TableCell>
                              <TableCell align="right">{formatQty(row.quantity)}</TableCell>
                              <TableCell align="right">{formatCurrency(row.revenue)}</TableCell>
                              <TableCell align="right">{formatCurrency(row.cost)}</TableCell>
                              <TableCell align="right">{formatCurrency(row.gross_profit)}</TableCell>
                              <TableCell align="right">{formatPercent(row.markup_percent)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <EmptyHint>Нет продаж по поставщикам за период</EmptyHint>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      ) : null}
    </Box>
  );
};

export default Dashboard;
