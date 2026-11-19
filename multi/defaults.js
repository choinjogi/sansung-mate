// 새 매장을 만들 때 넣는 기본 규칙 = 지금 산성 규칙. 사장님이 매장 설정 화면에서 바꾼다.
// 저장 위치: stores/{매장}/rules/{적용 시작 달 YYYY-MM}. null = 사장님이 꼭 채워야 하는 칸.
export const STORE_RULES_DEFAULT = {
  open: {
    days: [1, 2, 3, 4, 5, 6, 0],   // 영업 요일 (0=일)
    startTime: '18:00',            // 기본 정시 출근 (직원마다 members.startTime으로 따로 줄 수 있음)
    lateGraceMin: 0,               // 정시 뒤 몇 분까지 지각 아님
  },
  pay: {
    baseWage: null,                // 기본 시급(원)
    startFrom: 'scheduled',        // 계산 시작: 정시(또는 일찍 부른 시각). 늦게 오면 찍은 시각부터
    roundMin: 0,                   // 퇴근 시각 몇 분 단위로 내림 (0 = 그대로)
    juhu: { on: true, minWeekHours: 15, weekSplit: 'month7' }, // 주휴: 1~7일, 8~14일처럼 7일씩 끊어서
    night: { on: false, from: '22:00', to: '06:00', rate: 1.5 },
    holiday: { on: false, rate: 1.5 },
    payday: null,                  // 급여일(매달 며칠)
  },
  leave: {
    opensDow: 5, opensTime: '00:00',   // 금 0시 열림
    closesDow: 6, closesTime: '22:00', // 토 22시 마감
    weekendMorningAsk: true,           // 주말 오전 가능 여부도 받음
    maxOffPerDay: null,                // 한 날 최대 휴무 인원 (null = 제한 없음)
  },
  staffing: {
    need: [4, 4, 4, 4, 4, 5, 5],       // 요일별(일~토) 필요한 알바 수 (저녁). 매장마다 바꿈
    amStart: '12:00', amEnd: '15:00',  // 주말 오전 근무 시간
  },
};
