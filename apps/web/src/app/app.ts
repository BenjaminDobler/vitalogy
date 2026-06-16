import { Component, HostListener, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ShellComponent } from 'ui';
import { ChatPanelComponent, CoachPanelService } from 'feature-coach';

@Component({
  imports: [RouterModule, ShellComponent, ChatPanelComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly coachPanel = inject(CoachPanelService);

  /** Close the drawer on Esc, mirroring the close button + backdrop tap. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.coachPanel.isOpen()) this.coachPanel.close();
  }
}
