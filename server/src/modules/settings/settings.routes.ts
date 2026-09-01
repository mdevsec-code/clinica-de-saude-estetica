import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { getPublicSettings } from './settings.service';

export const settingsRouter = Router();

settingsRouter.get(
  '/public',
  asyncHandler(async (req, res) => {
    const settings = await getPublicSettings(req.tenant.id);
    res.json(settings);
  }),
);
