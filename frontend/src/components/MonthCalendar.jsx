import { useMemo, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

const formatDateRu = (iso) => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '';
  return `${day}.${month}.${year}`;
};

const toISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const mondayIndex = (date) => (date.getDay() + 6) % 7;

const parseISODate = (iso) => {
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const monthCells = (cursor) => {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - mondayIndex(first));
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push({
      date,
      iso: toISODate(date),
      outside: date.getMonth() !== cursor.getMonth(),
    });
  }
  return cells;
};

const MonthCalendar = ({ value, valueTo, range = false, onSelect }) => {
  const selected = parseISODate(value);
  const [cursor, setCursor] = useState(
    () => selected || new Date(),
  );
  const [hoverIso, setHoverIso] = useState(null);

  const cells = useMemo(() => monthCells(cursor), [cursor]);
  const startIso = value || '';
  const endIso = valueTo || (range && startIso && hoverIso ? hoverIso : '');
  const fromIso = startIso && endIso && endIso < startIso ? endIso : startIso;
  const toIso = startIso && endIso && endIso < startIso ? startIso : endIso;

  const handleDay = (iso) => {
    if (!range) {
      onSelect(iso, '');
      return;
    }
    if (!value || valueTo) {
      onSelect(iso, '');
      return;
    }
    if (iso < value) onSelect(iso, value);
    else onSelect(value, iso);
  };

  return (
    <Box sx={{ width: 308, p: 1.5, userSelect: 'none' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <IconButton
          size="small"
          aria-label="Предыдущий месяц"
          onClick={() => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
        >
          <ChevronLeft />
        </IconButton>
        <Typography sx={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: '0.95rem', textTransform: 'capitalize' }}>
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </Typography>
        <IconButton
          size="small"
          aria-label="Следующий месяц"
          onClick={() => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
        >
          <ChevronRight />
        </IconButton>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0.5 }}>
        {WEEKDAYS.map((day) => (
          <Typography
            key={day}
            sx={{ textAlign: 'center', fontSize: 12, color: 'text.secondary', py: 0.5 }}
          >
            {day}
          </Typography>
        ))}
      </Box>
      <Box
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}
        onMouseLeave={() => setHoverIso(null)}
      >
        {cells.map((cell) => {
          const isStart = Boolean(fromIso) && cell.iso === fromIso;
          const isEnd = Boolean(toIso) && cell.iso === toIso;
          const inBar = Boolean(fromIso && toIso && fromIso !== toIso && cell.iso >= fromIso && cell.iso <= toIso);
          const sameDay = isStart && isEnd;
          return (
            <Box
              key={cell.iso}
              onMouseEnter={() => {
                if (range && value && !valueTo) setHoverIso(cell.iso);
              }}
              sx={{
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: inBar ? 'rgba(204, 94, 51, 0.14)' : 'transparent',
                borderTopLeftRadius: isStart && !sameDay ? 8 : 0,
                borderBottomLeftRadius: isStart && !sameDay ? 8 : 0,
                borderTopRightRadius: isEnd && !sameDay ? 8 : 0,
                borderBottomRightRadius: isEnd && !sameDay ? 8 : 0,
              }}
            >
              <Box
                component="button"
                type="button"
                onClick={() => handleDay(cell.iso)}
                aria-label={formatDateRu(cell.iso)}
                aria-pressed={isStart || isEnd}
                sx={{
                  width: 32,
                  height: 32,
                  border: 0,
                  p: 0,
                  borderRadius: 1,
                  cursor: 'pointer',
                  bgcolor: isStart || isEnd ? 'primary.main' : 'transparent',
                  color: isStart || isEnd
                    ? 'primary.contrastText'
                    : cell.outside
                      ? 'text.disabled'
                      : 'text.primary',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  '&:hover': {
                    bgcolor: isStart || isEnd ? 'primary.dark' : 'rgba(204, 94, 51, 0.12)',
                  },
                }}
              >
                {cell.date.getDate()}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default MonthCalendar;
