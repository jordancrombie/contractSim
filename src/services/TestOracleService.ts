import prisma from '../config/database';
import { EventStatus } from '@prisma/client';
import { settlementService } from './SettlementService';

const ORACLE_ID = 'test_oracle';
const GAME_DURATION_MINUTES = 4;
const GAME_INTERVAL_MINUTES = 5;

interface TestGame {
  eventId: string;
  title: string;
  teamA: string;
  teamB: string;
  startsAt: Date;
  endsAt: Date;
  status: EventStatus;
  result?: {
    winner: string;
    scoreA: number;
    scoreB: number;
  };
}

export class TestOracleService {
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Initialize the test oracle in the database
   */
  async initialize(): Promise<void> {
    await prisma.oracle.upsert({
      where: { oracleId: ORACLE_ID },
      create: {
        oracleId: ORACLE_ID,
        name: 'Test Oracle',
        description: 'Automated test oracle generating games every 5 minutes',
        eventTypes: ['game_outcome'],
        isActive: true,
      },
      update: {
        isActive: true,
      },
    });

    console.log('[TestOracle] Initialized');
  }

  /**
   * Start the oracle (generates games on a schedule)
   */
  start(): void {
    if (this.intervalId) {
      console.log('[TestOracle] Already running');
      return;
    }

    console.log('[TestOracle] Starting - games every 5 minutes');

    // Run immediately
    this.tick();

    // Then run every minute to check for game updates
    this.intervalId = setInterval(() => this.tick(), 60 * 1000);
  }

  /**
   * Stop the oracle
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[TestOracle] Stopped');
    }
  }

  /**
   * Main tick - check and update games
   */
  private async tick(): Promise<void> {
    try {
      const now = new Date();
      const minute = now.getMinutes() % GAME_INTERVAL_MINUTES;

      // At minute 0 or 5, start a new game
      if (minute === 0) {
        await this.maybeCreateGame(now);
      }

      // Check for games that need to be resolved
      await this.resolveCompletedGames(now);

    } catch (err) {
      console.error('[TestOracle] Tick error:', err);
    }
  }

  /**
   * Create a new game if one isn't already running
   */
  private async maybeCreateGame(now: Date): Promise<void> {
    // Check if there's already an upcoming/in_progress game
    const activeGame = await prisma.oracleEvent.findFirst({
      where: {
        oracleId: ORACLE_ID,
        status: { in: [EventStatus.UPCOMING, EventStatus.IN_PROGRESS] },
      },
    });

    if (activeGame) {
      return;
    }

    // Create new game
    const startsAt = new Date(now);
    startsAt.setSeconds(0, 0);

    const endsAt = new Date(startsAt);
    endsAt.setMinutes(endsAt.getMinutes() + GAME_DURATION_MINUTES);

    const gameNumber = Math.floor(now.getTime() / (GAME_INTERVAL_MINUTES * 60 * 1000));
    const eventId = `test_game_${gameNumber}`;

    await prisma.oracleEvent.create({
      data: {
        oracleId: ORACLE_ID,
        eventId,
        eventType: 'game_outcome',
        title: `Test Game #${gameNumber % 1000}`,
        description: 'Team A vs Team B',
        status: EventStatus.IN_PROGRESS,
        startsAt,
        endsAt,
      },
    });

    console.log(`[TestOracle] Game started: ${eventId}`);
  }

  /**
   * Resolve games that have ended
   */
  private async resolveCompletedGames(now: Date): Promise<void> {
    const gamesEnded = await prisma.oracleEvent.findMany({
      where: {
        oracleId: ORACLE_ID,
        status: EventStatus.IN_PROGRESS,
        endsAt: { lte: now },
      },
    });

    for (const game of gamesEnded) {
      // Determine winner (50/50 random, seeded by eventId for reproducibility)
      const seed = this.hashString(game.eventId);
      const teamAWins = seed % 2 === 0;

      const scoreA = teamAWins ? 3 + (seed % 4) : 1 + (seed % 3);
      const scoreB = teamAWins ? 1 + ((seed >> 4) % 3) : 3 + ((seed >> 4) % 4);

      const result = {
        winner: teamAWins ? 'team_a' : 'team_b',
        winner_name: teamAWins ? 'Team A' : 'Team B',
        loser: teamAWins ? 'team_b' : 'team_a',
        loser_name: teamAWins ? 'Team B' : 'Team A',
        score_a: scoreA,
        score_b: scoreB,
      };

      await prisma.oracleEvent.update({
        where: { id: game.id },
        data: {
          status: EventStatus.COMPLETED,
          result,
          resolvedAt: now,
        },
      });

      console.log(`[TestOracle] Game resolved: ${game.eventId} - Winner: ${result.winner_name} (${scoreA}-${scoreB})`);

      // Notify ContractSim about the outcome
      await this.notifyOutcome(game.eventId, result);
    }
  }

  /**
   * Notify contracts waiting on this event
   */
  private async notifyOutcome(eventId: string, result: object): Promise<void> {
    // Find contracts with conditions on this event
    const conditions = await prisma.condition.findMany({
      where: {
        oracleId: ORACLE_ID,
        eventId,
        status: 'PENDING',
      },
      include: {
        contract: true,
      },
    });

    for (const condition of conditions) {
      // Evaluate predicate
      const resultValue = (result as Record<string, unknown>)[condition.predicateField];
      let matched = false;

      switch (condition.predicateOperator) {
        case 'EQUALS':
          matched = String(resultValue) === condition.predicateValue;
          break;
        case 'NOT_EQUALS':
          matched = String(resultValue) !== condition.predicateValue;
          break;
        // Add more operators as needed
      }

      // Update condition
      await prisma.condition.update({
        where: { id: condition.id },
        data: {
          status: 'RESOLVED',
          result: matched,
          evidence: result,
          resolvedAt: new Date(),
        },
      });

      console.log(`[TestOracle] Condition ${condition.id} resolved: ${matched}`);

      // Trigger settlement if contract is ACTIVE and all conditions resolved
      try {
        const settled = await settlementService.checkAndSettle(condition.contractId);
        if (settled) {
          console.log(`[TestOracle] Triggered settlement for contract ${condition.contractId}`);
        }
      } catch (err) {
        console.error(`[TestOracle] Settlement error for ${condition.contractId}:`, err);
      }
    }
  }

  /**
   * Get upcoming events
   */
  async getUpcomingEvents(): Promise<TestGame[]> {
    const events = await prisma.oracleEvent.findMany({
      where: {
        oracleId: ORACLE_ID,
        status: { in: [EventStatus.UPCOMING, EventStatus.IN_PROGRESS] },
      },
      orderBy: { startsAt: 'asc' },
      take: 10,
    });

    return events.map(e => ({
      eventId: e.eventId,
      title: e.title,
      teamA: 'Team A',
      teamB: 'Team B',
      startsAt: e.startsAt,
      endsAt: e.endsAt!,
      status: e.status,
    }));
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId: string): Promise<TestGame | null> {
    const event = await prisma.oracleEvent.findUnique({
      where: {
        oracleId_eventId: {
          oracleId: ORACLE_ID,
          eventId,
        },
      },
    });

    if (!event) return null;

    return {
      eventId: event.eventId,
      title: event.title,
      teamA: 'Team A',
      teamB: 'Team B',
      startsAt: event.startsAt,
      endsAt: event.endsAt!,
      status: event.status,
      result: event.result as TestGame['result'],
    };
  }

  /**
   * Force resolve an event (for testing)
   */
  async forceResolve(eventId: string, winner: 'team_a' | 'team_b'): Promise<void> {
    const event = await prisma.oracleEvent.findUnique({
      where: {
        oracleId_eventId: {
          oracleId: ORACLE_ID,
          eventId,
        },
      },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    const result = {
      winner,
      winner_name: winner === 'team_a' ? 'Team A' : 'Team B',
      loser: winner === 'team_a' ? 'team_b' : 'team_a',
      loser_name: winner === 'team_a' ? 'Team B' : 'Team A',
      score_a: winner === 'team_a' ? 3 : 1,
      score_b: winner === 'team_a' ? 1 : 3,
    };

    await prisma.oracleEvent.update({
      where: { id: event.id },
      data: {
        status: EventStatus.COMPLETED,
        result,
        resolvedAt: new Date(),
      },
    });

    await this.notifyOutcome(eventId, result);
  }

  /**
   * Simple hash function for deterministic randomness
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

export const testOracleService = new TestOracleService();
