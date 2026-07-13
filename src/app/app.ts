import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TitleScreen } from './components/title-screen/title-screen';

@Component({
  selector: 'app-root',
  imports: [TitleScreen],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly title = signal('kelimebaz');
}
