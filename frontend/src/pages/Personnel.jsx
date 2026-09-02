import { Box, Button, IconButton, Paper, Tab, Tabs, Typography } from '@mui/material';
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
          mb: 3,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <span className="material-icons" style={{ fontSize: 28, color: '#CC5E33' }} aria-hidden="true">badge</span>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1A202C' }}>Персонал</Typography>
        </Box>

        {/* Month picker */}
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: '#F7FAFC',
            borderRadius: '12px',
            border: '1px solid #EDF2F7',
            px: 1,
            py: 0.25,
          }}
        >
          <IconButton size="small" aria-label="Предыдущий месяц" onClick={() => shiftMonth(-1)}>
            <ChevronLeft sx={{ fontSize: 20 }} />
          </IconButton>
          <Typography
            sx={{
              minWidth: 160,
              textAlign: 'center',
              fontWeight: 700,
              textTransform: 'capitalize',
              color: '#2D3748',
              fontSize: '0.95rem',
              userSelect: 'none',
            }}
          >
            {MONTHS[month - 1]} {year}
          </Typography>
          <IconButton size="small" aria-label="Следующий месяц" onClick={() => shiftMonth(1)}>
            <ChevronRight sx={{ fontSize: 20 }} />
          </IconButton>
          {!isCurrent && (
            <Button
              onClick={() => {
                setYear(now.year);
                setMonth(now.month);
              }}
              size="small"
              sx={{ textTransform: 'none', fontWeight: 600, ml: 0.5, fontSize: '0.78rem', borderRadius: '8px' }}
            >
              Сейчас
            </Button>
          )}
        </Paper>
      </Box>

      <Tabs
        value={tab}
        onChange={(_event, next) => setTab(next)}
        sx={{
          mb: 2.5,
          '& .MuiTabs-indicator': {
            height: 3,
            borderRadius: '3px 3px 0 0',
            bgcolor: '#CC5E33',
          },
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 600,
            minHeight: 48,
            fontSize: '0.9rem',
            color: '#718096',
            '&.Mui-selected': { color: '#CC5E33' },
          },
        }}
      >
        <Tab
          label="Сотрудники"
          id="personnel-tab-employees"
          aria-controls="personnel-panel-employees"
          icon={<span className="material-icons" style={{ fontSize: 18 }} aria-hidden="true">people</span>}
          iconPosition="start"
        />
        <Tab
          label="Отпуска / отгулы"
          id="personnel-tab-leaves"
          aria-controls="personnel-panel-leaves"
          icon={<span className="material-icons" style={{ fontSize: 18 }} aria-hidden="true">event_note</span>}
          iconPosition="start"
        />
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
