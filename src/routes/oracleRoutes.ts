import { Router, Request, Response } from 'express';
import { testOracleService } from '../services/TestOracleService';
import { serviceAuth } from '../middleware/auth';

const router = Router();

/**
 * GET /api/v1/oracles
 * List available oracles
 */
router.get('/', async (req: Request, res: Response) => {
  res.json({
    oracles: [
      {
        oracle_id: 'test_oracle',
        name: 'Test Oracle',
        description: 'Automated test games every 5 minutes',
        event_types: ['game_outcome'],
        is_active: true,
      },
    ],
  });
});

/**
 * GET /api/v1/oracles/test/events/upcoming
 * Get upcoming test oracle events
 */
router.get('/test/events/upcoming', async (req: Request, res: Response) => {
  const events = await testOracleService.getUpcomingEvents();

  res.json({
    oracle_id: 'test_oracle',
    events: events.map(e => ({
      event_id: e.eventId,
      title: e.title,
      teams: [e.teamA, e.teamB],
      starts_at: e.startsAt.toISOString(),
      ends_at: e.endsAt.toISOString(),
      status: e.status.toLowerCase(),
    })),
  });
});

/**
 * GET /api/v1/oracles/test/events/:eventId
 * Get a specific test oracle event
 */
router.get('/test/events/:eventId', async (req: Request, res: Response) => {
  const event = await testOracleService.getEvent(req.params.eventId);

  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  res.json({
    oracle_id: 'test_oracle',
    event_id: event.eventId,
    title: event.title,
    teams: [event.teamA, event.teamB],
    starts_at: event.startsAt.toISOString(),
    ends_at: event.endsAt.toISOString(),
    status: event.status.toLowerCase(),
    result: event.result ? {
      winner: event.result.winner,
      score_a: event.result.scoreA,
      score_b: event.result.scoreB,
    } : null,
  });
});

/**
 * POST /api/v1/oracles/test/resolve
 * Force resolve an event (for testing)
 * Auth required
 */
router.post('/test/resolve', serviceAuth, async (req: Request, res: Response) => {
  const { event_id, winner } = req.body;

  if (!event_id || !winner) {
    res.status(400).json({ error: 'Missing event_id or winner' });
    return;
  }

  if (!['team_a', 'team_b'].includes(winner)) {
    res.status(400).json({ error: 'Winner must be team_a or team_b' });
    return;
  }

  try {
    await testOracleService.forceResolve(event_id, winner);
    res.json({ message: 'Event resolved', event_id, winner });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
