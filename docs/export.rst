Export a Paperboat station
==========================

The dock exports the model as a Simplicial station: **Download** a ``<model>.pst``, or **Start** it on a
free port (and **Stop** it). Both generate into ``<tmp>/articula_<model>`` and run Simplicial's
``paperboat pack`` or ``paperboat run`` there, through ``$PAPERBOAT_BIN`` or ``paperboat`` on PATH, so
Simplicial must be installed (``paperboat app install simplicial``). The first export of a model builds
the engine, which takes minutes.

In the station, the model's parameters (a ``parameter Real C1F``) are props of its Station object,
edited on the Station page; the Flow block carries only the inputs and outputs. See the
`Simplicial manual <https://paperboatlab.org/apps/simplicial/>`_ for running it.
