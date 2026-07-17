"""`python -m worker` — starts the polling worker loop.

Imports `worker.tasks` for its side effect (registering job handlers via the
`@register` decorator) before starting the loop, so `python -m worker` alone
is a complete, runnable worker process.
"""

import logging

from worker import tasks  # noqa: F401 - import registers job handlers
from worker.queue import Worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def main() -> None:
    Worker(poll_interval=2.0).run()


if __name__ == "__main__":
    main()
