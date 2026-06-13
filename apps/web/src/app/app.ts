import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ShellComponent } from 'ui';

@Component({
  imports: [RouterModule, ShellComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected title = 'vitalogy';
}
