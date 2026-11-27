OpenModelica (omc)
==================

omc is Paperboat's ``omc`` runtime: the pinned ``openmodelica/openmodelica`` image, run by
``paperboatd`` (started on demand, as the ``paperboat`` CLI starts it) with no network. Articula
holds one session per workspace; the workspace is mounted for omc to read and save, simulations build
in the session's own work folder, and libraries live in the workspace's package volume.

- ``paperboat runtime list`` shows the runtime and where it can run; ``paperboat runtime pull omc``
  pulls the image (``paperboat app install articula`` does).
- ``paperboat runtime ps`` lists the running sessions; the Launcher's Runtimes page shows them too.
- ``paperboat package list|add|remove omc <library> --project <folder>`` manages the libraries:
  the network is allowed for that step only.

In Articula, the runtimes key in the bar shows omc's state; its Libraries… opens the library list.
Model › Manage runtimes… opens the Launcher on Runtimes › omc (``paperboat launcher --page runtimes --runtime omc``).
A session that fails starts again with the next call, loading again what the last one had.
