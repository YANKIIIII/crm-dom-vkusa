import { Box, CircularProgress, Paper, Tooltip, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api';
import { useFeedback } from '../../hooks/useFeedback';
import { extractApiError, unwrapList } from '../../utils';
import LeaveDialog from './LeaveDialog';

const VACATION_BG = 'linear-gradient(135deg, #78909C 0%, #90A4AE 100%)';
const VACATION_FLAT = '#90A4AE';
const VACATION_BORDER = '#B0BEC5';
const TIME_OFF_BG = 'linear-gradient(135deg, rgba(204, 94, 51, 0.50) 0%, rgba(204, 94, 51, 0.35) 100%)';
const TIME_OFF_FLAT = 'rgba(204, 94, 51, 0.40)';
const TIME_OFF_BORDER = 'rgba(204, 94, 51, 0.55)';
const WEEKEND_BG = '#F0F2F5';
const NAME_COL = 200;
const DAY_MIN = 32;
const BAR_HEIGHT = 22;
const BAR_GAP = 4;

const DOW_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const KIND_LABELS = {
  vacation: 'Отпуск',
  time_off: 'Отгул',
};

const pad2 = (value) => String(value).padStart(2, '0');

const isoDate = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

const employeeName = (row) => (
  `${row.last_name || ''} ${row.first_name || ''}`.trim() || row.username || `Сотрудник #${row.id}`
);

const employeeInitials = (row) => {
  const last = (row.last_name || '')[0] || '';
  const first = (row.first_name || '')[0] || '';
  return (last + first).toUpperCase() || (row.username || '?')[0].toUpperCase();
};

const formatIso = (iso) => {
  if (!iso) return '';
  const [year, month, day] = String(iso).split('-');
  if (!year || !month || !day) return String(iso);
  return `${day}.${month}.${year}`;
};

const formatIsoRange = (from, to) => {
  if (!from) return '';
  if (!to || to === from) return formatIso(from);
  return `${formatIso(from)}–${formatIso(to)}`;
};

const leaveColors = (kind) => {
  switch (kind) {
    case 'vacation':
      return { bg: VACATION_BG, flat: VACATION_FLAT, border: VACATION_BORDER };
    case 'time_off':
      return { bg: TIME_OFF_BG, flat: TIME_OFF_FLAT, border: TIME_OFF_BORDER };
    default:
      return { bg: '#CBD5E0', flat: '#CBD5E0', border: '#A0AEC0' };
  }
};

const clipLeaveToMonth = (leave, year, month) => {
  const startIso = isoDate(year, month, 1);
  const endIso = isoDate(year, month, daysInMonth(year, month));
  const from = leave.date_from < startIso ? startIso : leave.date_from;
  const to = leave.date_to > endIso ? endIso : leave.date_to;
  if (!from || !to || from > to) return null;
  return {
    ...leave,
    from,
    to,
    startDay: Number(from.slice(8, 10)),
    endDay: Number(to.slice(8, 10)),
  };
};

const withLanes = (clipped) => {
  const sorted = [...clipped].sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay);
  const laneEnds = [];
  return sorted.map((item) => {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= item.startDay) {
      lane += 1;
    }
    if (lane === laneEnds.length) laneEnds.push(item.endDay);
    else laneEnds[lane] = item.endDay;
    return { ...item, lane };
  });
};

const userIdOf = (leave) => leave?.user?.id ?? leave?.user;

const todayMinskIso = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Minsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

const isWeekend = (year, month, day) => {
  const dow = new Date(year, month - 1, day).getDay();
  return dow === 0 || dow === 6;
};

const LeaveCalendar = ({ year, month }) => {
  const { notify } = useFeedback();
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [version, setVersion] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [editingLeave, setEditingLeave] = useState(null);
  const [leavePreset, setLeavePreset] = useState(null);

  const days = daysInMonth(year, month);
  const todayIso = useMemo(() => todayMinskIso(), []);
  const bump = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLeaves([]);
    Promise.all([
      api.get('/personnel/employees/', { params: { year, month } }),
      api.get('/personnel/leaves/', { params: { year, month } }),
    ])
      .then(([employeesRes, leavesRes]) => {
        if (cancelled) return;
        setEmployees(unwrapList(employeesRes.data));
        setLeaves(unwrapList(leavesRes.data));
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(extractApiError(err));
        notify(`Не удалось загрузить календарь:\n${extractApiError(err)}`, 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month, version, notify]);

  const byUser = useMemo(() => {
    const map = new Map();
    leaves.forEach((leave) => {
      const clipped = clipLeaveToMonth(leave, year, month);
      if (!clipped) return;
      const uid = Number(userIdOf(leave));
      if (!Number.isFinite(uid)) return;
      const list = map.get(uid) || [];
      list.push(clipped);
      map.set(uid, list);
    });
    map.forEach((list, uid) => {
      map.set(uid, withLanes(list));
    });
    return map;
  }, [leaves, year, month]);

  const openCreate = (employeeId, day) => {
    const iso = isoDate(year, month, day);
    setEditingLeave(null);
    setLeavePreset({
      user: employeeId,
      kind: 'vacation',
      date_from: iso,
      date_to: iso,
    });
    setLeaveOpen(true);
  };

  const openEdit = (leave) => {
    setEditingLeave(leave);
    setLeavePreset(null);
    setLeaveOpen(true);
  };

  const onDayClick = (employee, day) => {
    // Не открываем создание на выходных — только редактирование существующего
    const weekend = isWeekend(year, month, day);
    const iso = isoDate(year, month, day);
    const covering = (byUser.get(Number(employee.id)) || []).find(
      (item) => item.date_from <= iso && item.date_to >= iso,
    );
    if (covering) {
      openEdit(covering);
      return;
    }
    if (weekend) return; // выходные — нельзя создавать
    openCreate(employee.id, day);
  };

  if (loading && employees.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
    );
  }

  if (loadError && employees.length === 0) {
    return (
      <Typography sx={{ color: '#E53E3E', py: 2 }}>{loadError}</Typography>
    );
  }

  if (employees.length === 0) {
    return (
      <Typography sx={{ color: '#718096', py: 2 }}>
        Сотрудников заводят в разделе Пользователи
      </Typography>
    );
  }

  return (
    <>
      <Paper sx={{ p: 0, overflow: 'auto', borderRadius: 3 }}>
        <Box sx={{ minWidth: NAME_COL + days * DAY_MIN }}>
          {/* Header row: day numbers + day-of-week */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `${NAME_COL}px 1fr`,
              position: 'sticky',
              top: 0,
              zIndex: 3,
              bgcolor: '#FAFBFC',
              borderBottom: '2px solid #E2E8F0',
            }}
          >
            <Box
              sx={{
                position: 'sticky',
                left: 0,
                zIndex: 4,
                bgcolor: '#FAFBFC',
                px: 1.5,
                py: 1.5,
                fontWeight: 700,
                color: '#4A5568',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'flex-end',
              }}
            >
              Сотрудник
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${days}, minmax(${DAY_MIN}px, 1fr))`,
              }}
            >
              {Array.from({ length: days }, (_, index) => {
                const day = index + 1;
                const iso = isoDate(year, month, day);
                const weekday = new Date(year, month - 1, day).getDay();
                const weekend = weekday === 0 || weekday === 6;
                const isToday = iso === todayIso;
                return (
                  <Box
                    key={iso}
                    sx={{
                      textAlign: 'center',
                      py: 0.75,
                      bgcolor: isToday
                        ? 'rgba(204, 94, 51, 0.10)'
                        : weekend
                          ? WEEKEND_BG
                          : 'transparent',
                      borderRadius: isToday ? '6px 6px 0 0' : 0,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontWeight: isToday ? 800 : 600,
                        color: isToday ? '#CC5E33' : weekend ? '#A0AEC0' : '#2D3748',
                        lineHeight: 1.2,
                      }}
                    >
                      {day}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 9,
                        fontWeight: 500,
                        color: isToday ? '#CC5E33' : weekend ? '#CBD5E0' : '#A0AEC0',
                        lineHeight: 1.2,
                        mt: '1px',
                        textTransform: 'lowercase',
                      }}
                    >
                      {DOW_LABELS[weekday]}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* Employee rows */}
          {employees.map((employee, empIdx) => {
            const rowLeaves = byUser.get(Number(employee.id)) || [];
            const laneCount = rowLeaves.reduce((max, item) => Math.max(max, item.lane + 1), 1);
            const rowHeight = Math.max(44, laneCount * (BAR_HEIGHT + BAR_GAP) + 14);
            return (
              <Box
                key={employee.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `${NAME_COL}px 1fr`,
                  borderBottom: '1px solid #EDF2F7',
                  opacity: employee.is_active ? 1 : 0.45,
                  minHeight: rowHeight,
                  bgcolor: empIdx % 2 === 1 ? 'rgba(247, 250, 252, 0.5)' : 'transparent',
                  transition: 'background-color 0.15s',
                  '&:hover': { bgcolor: 'rgba(237, 242, 247, 0.6)' },
                }}
              >
                {/* Employee name */}
                <Box
                  sx={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    bgcolor: empIdx % 2 === 1 ? '#FAFBFC' : '#FFFFFF',
                    px: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderRight: '1px solid #EDF2F7',
                  }}
                >
                  {/* Avatar circle */}
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      bgcolor: employee.is_active ? '#CC5E33' : '#A0AEC0',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      flexShrink: 0,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {employeeInitials(employee)}
                  </Box>
                  <Typography
                    sx={{
                      fontWeight: 600,
                      color: '#1A202C',
                      fontSize: '0.8rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {employeeName(employee)}
                  </Typography>
                </Box>

                {/* Days grid + leave bars */}
                <Box sx={{ position: 'relative', minHeight: rowHeight }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${days}, minmax(${DAY_MIN}px, 1fr))`,
                      height: '100%',
                    }}
                  >
                    {Array.from({ length: days }, (_, index) => {
                      const day = index + 1;
                      const iso = isoDate(year, month, day);
                      const weekend = isWeekend(year, month, day);
                      const isToday = iso === todayIso;
                      return (
                        <Box
                          key={iso}
                          component="button"
                          type="button"
                          aria-label={`${employeeName(employee)}, ${formatIso(iso)}`}
                          onClick={() => onDayClick(employee, day)}
                          sx={{
                            border: 0,
                            borderLeft: '1px solid #EDF2F7',
                            p: 0,
                            cursor: weekend ? 'default' : 'pointer',
                            bgcolor: isToday
                              ? 'rgba(204, 94, 51, 0.06)'
                              : weekend
                                ? WEEKEND_BG
                                : 'transparent',
                            '&:hover': weekend
                              ? {}
                              : { bgcolor: 'rgba(204, 94, 51, 0.10)' },
                            // Diagonal stripe pattern for weekends
                            ...(weekend && !isToday ? {
                              backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(160, 174, 192, 0.12) 3px, rgba(160, 174, 192, 0.12) 4px)',
                            } : {}),
                          }}
                        />
                      );
                    })}
                  </Box>

                  {/* Leave bars */}
                  {rowLeaves.map((item) => {
                    const colors = leaveColors(item.kind);
                    const widthPct = ((item.endDay - item.startDay + 1) / days) * 100;
                    const leftPct = ((item.startDay - 1) / days) * 100;
                    const workingDaysStr = item.working_days ? ` (${item.working_days} раб. дн.)` : '';
                    const label = `${KIND_LABELS[item.kind] || item.kind} ${formatIsoRange(item.date_from, item.date_to)}${workingDaysStr}${item.comment ? `\n${item.comment}` : ''}`;
                    return (
                      <Tooltip key={item.id} title={label} placement="top">
                        <Box
                          component="button"
                          type="button"
                          aria-label={label}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(item);
                          }}
                          sx={{
                            position: 'absolute',
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            top: 8 + item.lane * (BAR_HEIGHT + BAR_GAP),
                            height: BAR_HEIGHT,
                            borderRadius: '6px',
                            border: `1px solid ${colors.border}`,
                            background: colors.bg,
                            cursor: 'pointer',
                            zIndex: 1,
                            p: 0,
                            overflow: 'hidden',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                            transition: 'filter 0.15s, box-shadow 0.15s',
                            '&:hover': {
                              filter: 'brightness(0.93)',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.14)',
                            },
                          }}
                        />
                      </Tooltip>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Paper>

      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 3, mt: 2, color: '#718096', fontSize: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 20, height: 12, borderRadius: '4px', bgcolor: VACATION_FLAT, border: `1px solid ${VACATION_BORDER}` }} />
          <Typography variant="caption" sx={{ color: '#4A5568' }}>Отпуск</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 20, height: 12, borderRadius: '4px', bgcolor: TIME_OFF_FLAT, border: `1px solid ${TIME_OFF_BORDER}` }} />
          <Typography variant="caption" sx={{ color: '#4A5568' }}>Отгул</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            sx={{
              width: 20,
              height: 12,
              borderRadius: '4px',
              bgcolor: WEEKEND_BG,
              border: '1px solid #E2E8F0',
              backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(160, 174, 192, 0.15) 3px, rgba(160, 174, 192, 0.15) 4px)',
            }}
          />
          <Typography variant="caption" sx={{ color: '#A0AEC0' }}>Выходной</Typography>
        </Box>
      </Box>

      <LeaveDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onSaved={bump}
        employees={employees}
        leave={editingLeave}
        preset={leavePreset}
      />
    </>
  );
};

export default LeaveCalendar;
