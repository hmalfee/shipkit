import { os } from '../base';
import { auth } from './auth';
import { todo } from './todo';

export const router = os.router({ auth, todo });
