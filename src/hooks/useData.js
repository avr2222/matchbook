import { useQuery } from '@tanstack/react-query'
import {
  fetchPlayers, fetchWeeks, fetchAttendance, fetchTransactions,
  fetchExpenses, fetchGuestVisits, fetchTournaments, fetchUsers,
  fetchAuditLog, fetchCricHeroesMapping, fetchConfig,
} from '../api/dataReader'

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
export const useMapping     = () => useQuery({ queryKey: ['ch_mapping'],   queryFn: fetchCricHeroesMapping,  staleTime: STALE })
