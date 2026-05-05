export interface User {
  id: string | null;
  name: string | null;
  username: string | null;
  token: string | null;
  status: string | null;
  bio: string | null;
  creationDate: string | null;
  gamesWon: number | null;
  roundsWon: number | null;
  roundsPlayed?: number | null;
  rounds?: number | null;
  roundCount?: number | null;
  gamesPlayed?: number | null;
  games?: number | null;
  averageScorePerRound: number | null;
  overallRank: number | null;
}
 
