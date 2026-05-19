/**
 * Notification system utilities
 * In production, uses Supabase Realtime for push notifications
 */

export type NotificationType =
  | 'game_invite'
  | 'game_accepted'
  | 'game_declined'
  | 'game_started'
  | 'game_finished'
  | 'game_win'
  | 'game_loss'
  | 'balance_change'
  | 'status_change'
  | 'pet_assigned'
  | 'pet_received'
  | 'debt_update'
  | 'bet_placed'
  | 'pari_closed'
  | 'bet_won'
  | 'bet_lost'
  | 'super_game_start'
  | 'announcement'
  | 'personal_message'
  | 'event_added'
  | 'kicked_from_game'
  | 'debt_deadline';

export interface CreateNotificationParams {
  recipientParticipantId?: string;
  recipientProfileId?: string;
  title: string;
  body?: string;
  type: NotificationType;
  linkUrl?: string;
}

/**
 * Create a notification (server-side)
 * In production: INSERT INTO notifications + trigger Supabase Realtime
 */
export async function createNotification(params: CreateNotificationParams) {
  // This would use the service client to insert into the notifications table
  // and Supabase Realtime would automatically push it to the subscribed client
  console.log('Creating notification:', params);
}

/**
 * Send notification to all participants
 */
export async function broadcastNotification(
  title: string,
  body: string,
  type: NotificationType,
  linkUrl?: string
) {
  console.log('Broadcasting:', { title, body, type, linkUrl });
}

/**
 * Notification templates
 */
export const NOTIFICATION_TEMPLATES = {
  gameInvite: (challenger: string, gameType: string, stake: number) => ({
    title: 'Вас позвали в игру',
    body: `${challenger} вызвал вас на ${gameType}. Ставка: ${stake} очков.`,
    type: 'game_invite' as NotificationType,
  }),
  gameWin: (gameType: string, amount: number) => ({
    title: 'Вы выиграли игру!',
    body: `Победа в ${gameType}. Выигрыш: +${amount} очков.`,
    type: 'game_win' as NotificationType,
  }),
  gameLoss: (gameType: string, amount: number) => ({
    title: 'Вы проиграли',
    body: `Поражение в ${gameType}. Потеря: -${amount} очков.`,
    type: 'game_loss' as NotificationType,
  }),
  petAssigned: (ownerName: string) => ({
    title: 'Вы стали Питомцем',
    body: `Ваш новый хозяин: ${ownerName}. Условия выкупа указаны в профиле.`,
    type: 'pet_assigned' as NotificationType,
  }),
  betWon: (pariTitle: string, amount: number) => ({
    title: 'Ваша ставка выиграла!',
    body: `Пари "${pariTitle}" завершено. Выигрыш: +${amount} очков.`,
    type: 'bet_won' as NotificationType,
  }),
  superGameStart: (title: string) => ({
    title: 'Большая Игра началась!',
    body: `«${title}» стартовала. Присоединяйтесь как зритель.`,
    type: 'super_game_start' as NotificationType,
  }),
};
