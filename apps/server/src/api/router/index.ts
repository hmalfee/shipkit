import { implementer } from '../base';
import { auth } from './auth';
import { todo } from './todo';

export const appRouter = implementer.router({ auth, todo });
