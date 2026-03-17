from typing import Optional, List
from pydantic import BaseModel, Field

class OrganizationJobPostingsQuery(BaseModel):
    organization_id: str = Field(description="The organization ID of the company for which you want to find job postings. Each company in the Apollo database is assigned a unique ID. To find IDs, call the [Organization Search endpoint](/reference/organization-search) and identify the values for `organization_id`. Example: `5e66b6381e05b4008c8331b8`")

class OrganizationJobPosting(BaseModel):
    id: str = Field(description="id")
    title: str = Field(description="title")
    url: str = Field(description="url")
    city: Optional[str] = Field(default=None, description="city")
    state: Optional[str] = Field(default=None, description="state")
    country: str = Field(description="country")
    last_seen_at: str = Field(description="last_seen_at")
    posted_at: str = Field(description="posted_at")

class OrganizationJobPostingsResponse(BaseModel):
    organization_job_postings: List[OrganizationJobPosting] = Field(description="organization_job_postings")
