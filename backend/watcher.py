import os
import time
import asyncio
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler


class ExcelHandler(FileSystemEventHandler):
    def __init__(self, filepath, callback):
        self._target = os.path.abspath(filepath)
        self.callback = callback
        self.last_trigger = 0

    def _should_trigger(self, src_path: str) -> bool:
        return os.path.abspath(src_path) == self._target

    def _trigger(self):
        now = time.time()
        if now - self.last_trigger > 1.5:
            self.last_trigger = now
            self.callback()

    def on_modified(self, event):
        if not event.is_directory and self._should_trigger(event.src_path):
            self._trigger()

    def on_created(self, event):
        if not event.is_directory and self._should_trigger(event.src_path):
            self._trigger()


def start_watcher(filepath, loop, on_change_coro):
    directory = os.path.dirname(os.path.abspath(filepath))

    def callback():
        asyncio.run_coroutine_threadsafe(on_change_coro(), loop)

    event_handler = ExcelHandler(filepath, callback)
    observer = Observer()
    observer.schedule(event_handler, directory, recursive=False)
    observer.start()
    return observer
