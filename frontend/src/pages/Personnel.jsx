import { Box, Button, IconButton, Tab, Tabs, Typography } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import { useMemo, useState } from 'react';
import EmployeesPanel from './personnel/EmployeesPanel';
import LeaveCalendar from './personnel/LeaveCalendar';

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

function currentMinskYearMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Minsk',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return { year, month };
}

const Personnel = () => {
  const now = useMemo(() => currentMinskYearMonth(), []);
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [tab, setTab] = useState(0);
  const isCurrent = year === now.year && month === now.month;

  const shiftMonth = (delta) => {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h4">Персонал</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton size="small" aria-label="Предыдущий месяц" onClick={() => shiftMonth(-1)}>
            <ChevronLeft />
          </IconButton>
          <Typography
            sx={{
              minWidth: 180,
              textAlign: 'center',
              fontWeight: 600,
              textTransform: 'capitalize',
              color: '#1A202C',
            }}
          >
            {MONTHS[month - 1]} {year}
          </Typography>
          <IconButton size="small" aria-label="Следующий месяц" onClick={() => shiftMonth(1)}>
            <ChevronRight />
          </IconButton>
          {!isCurrent && (
            <Button
              onClick={() => {
                setYear(now.year);
                setMonth(now.month);
              }}
              sx={{ textTransform: 'none', ml: 1 }}
            >
              Текущий месяц
            </Button>
          )}
        </Box>
      </Box>

      <Tabs
        value={tab}
        onChange={(_event, next) => setTab(next)}
        sx={{
          mb: 2,
          borderBottom: '1px solid #EDF2F7',
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minHeight: 48 },
        }}
      >
        <Tab label="Сотрудники" id="personnel-tab-employees" aria-controls="personnel-panel-employees" />
        <Tab label="Отпуска / отгулы" id="personnel-tab-leaves" aria-controls="personnel-panel-leaves" />
      </Tabs>

      {tab === 0 ? (
        <Box role="tabpanel" id="personnel-panel-employees" aria-labelledby="personnel-tab-employees">
          <EmployeesPanel year={year} month={month} />
        </Box>
      ) : (
        <Box role="tabpanel" id="personnel-panel-leaves" aria-labelledby="personnel-tab-leaves">
          <LeaveCalendar year={year} month={month} />
        </Box>
      )}
    </Box>
  );
};

export default Personnel;
