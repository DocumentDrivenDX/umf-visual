"""A ticket's phases, as Beacon tracks them (fictional example source)."""
from enum import Enum


class Phase(Enum):
    NEW = "new"            # arrived from the helpdesk, nobody has it yet
    ASSIGNED = "assigned"  # an agent has it; Beacon may draft
    ANSWERED = "answered"  # a reply was sent; waiting on the customer
    CLOSED = "closed"      # done for good


TRANSITIONS = {
    Phase.NEW: {Phase.ASSIGNED, Phase.CLOSED},
    Phase.ASSIGNED: {Phase.ASSIGNED, Phase.ANSWERED},
    Phase.ANSWERED: {Phase.ASSIGNED, Phase.CLOSED},
}
