import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchPlayers, fetchWeeks, fetchAttendance, fetchTransactions,
  fetchExpenses, fetchGuestVisits, fetchTournaments, fetchUsers,
  fetchAuditLog, fetchCricHeroesMapping, fetchConfig, fetchAnnouncements,
  fetchPaymentRequests, fetchMatchPerformances, fetchBallDeliveries,
  fetchSeasonSquads, fetchAttendanceSummary, fetchTshirtOrders,
} from '../api/dataReader'
import { addTshirtOrder, deleteTshirtOrder } from '../api/dataWriter'

const STALE = 30_000 // 30s

export const useConfig      = () => useQuery({ queryKey: ['config'],       queryFn: fetchConfig,             staleTime: STALE })
export const usePlayers     = () => useQuery({ queryKey: ['players'],      queryFn: fetchPlayers,            staleTime: STALE })
export const useWeeks       = () => useQuery({ queryKey: ['weeks'],        queryFn: fetchWeeks,              staleTime: STALE })
export const useAttendance  = () => useQuery({ queryKey: ['attendance'],   queryFn: fetchAttendance,         staleTime: STALE })
export const useTransactions= () => useQuery({ queryKey: ['transactions'], queryFn: fetchTransactions,       staleTime: STALE })
export const useExpenses    = () => useQuery({ queryKey: ['expenses'],     queryFn: fetchExpenses,           staleTime: STALE })
export const useGuestVisits = () => useQuery({ queryKey: ['guests'],       queryFn: fetchGuestVisits,        staleTime: STALE })
export const useTournaments = () => useQuery({ queryKey: ['tournaments'],  queryFn: fetchTournaments,        staleTime: STALE })
export const useUsers       = () => useQuery({ queryKey: ['users'],        queryFn: fetchUsers,              staleTime: STALE })
export const useAuditLog    = () => useQuery({ queryKey: ['audit_log'],    queryFn: fetchAuditLog,           staleTime: STALE })
export const useMapping          = () => useQuery({ queryKey: ['ch_mapping'],        queryFn: fetchCricHeroesMapping, staleTime: STALE })
export const useAnnouncements    = () => useQuery({ queryKey: ['announcements'],     queryFn: fetchAnnouncements,     staleTime: STALE })
export const usePaymentRequests  = () => useQuery({ queryKey: ['payment_requests'],  queryFn: fetchPaymentRequests,   staleTime: STALE })

export const useMatchPerformances = (playerId) =>
  useQuery({ queryKey: ['match_performances', playerId], queryFn: () => fetchMatchPerformances({ playerId }), staleTime: STALE })

export const useLeaderboard = (tournamentId) =>
  useQuery({ queryKey: ['leaderboard', tournamentId], queryFn: () => fetchMatchPerformances({ tournamentId }), staleTime: STALE, enabled: !!tournamentId })

export const useBallDeliveries = (tournamentId) =>
  useQuery({ queryKey: ['ball_deliveries', tournamentId], queryFn: () => fetchBallDeliveries(tournamentId), staleTime: 5 * 60_000, enabled: !!tournamentId })

export const useSeasonSquads = (tournamentId) =>
  useQuery({ queryKey: ['season_squads', tournamentId], queryFn: () => fetchSeasonSquads(tournamentId), staleTime: 5_000, enabled: !!tournamentId })

export const useAttendanceSummary = () =>
  useQuery({ queryKey: ['attendance_summary'], queryFn: fetchAttendanceSummary, staleTime: STALE })

export const useTshirtOrders = () =>
  useQuery({ queryKey: ['tshirt_orders'], queryFn: fetchTshirtOrders, staleTime: STALE })

export const useAddTshirtOrder = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: addTshirtOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tshirt_orders'] }),
  })
}

export const useDeleteTshirtOrder = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteTshirtOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tshirt_orders'] }),
  })
}
