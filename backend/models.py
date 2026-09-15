from sqlalchemy import Column, String, DateTime
from database import Base


class Lead(Base):
    __tablename__ = "leads"

    id = Column(String, primary_key=True)
    created_time = Column(DateTime(timezone=True), nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    campaign_name = Column(String, nullable=True)
    ad_name = Column(String, nullable=True)
    synced_at = Column(DateTime(timezone=True), nullable=False)

    reserved_by = Column(String, nullable=True)
    reserved_at = Column(DateTime(timezone=True), nullable=True)

    response = Column(String, nullable=True)
    response_at = Column(DateTime(timezone=True), nullable=True)
