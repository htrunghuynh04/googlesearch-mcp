"""
Apollo.io API Client Wrapper

This module provides a wrapper for Apollo.io API, supporting the following endpoints:
- People Enrichment: Enrich data for a specific person
- Organization Enrichment: Enrich data for a specific company
- People Search: Search for people by criteria
- Organization Search: Search for organizations by criteria
- Organization Job Postings: Get job postings for an organization

Reference: https://docs.apollo.io/reference
"""
from typing import Optional
import httpx

from apollo import *


class ApolloClient:
    """
    Client for communicating with Apollo.io API.

    Usage:
        client = ApolloClient(api_key="your_api_key")
        result = await client.people_search(query)

    Attributes:
        api_key: Apollo.io API key (get from https://app.apollo.io/settings/api)
        base_url: Base URL for Apollo.io API (default: https://api.apollo.io/api/v1)
        headers: HTTP headers used for all requests

    Example:
        >>> import os
        >>> from apollo_client import ApolloClient
        >>> api_key = os.getenv("APOLLO_IO_API_KEY")
        >>> client = ApolloClient(api_key)
        >>> query = PeopleSearchQuery(person_titles=["CEO"], organization_locations=["USA"])
        >>> response = await client.people_search(query)
    """

    def __init__(self, api_key: str):
        """
        Initialize ApolloClient.

        Args:
            api_key: Apollo.io API key. Get from https://app.apollo.io/settings/api

        Raises:
            ValueError: If api_key is empty or None
        """
        if not api_key:
            raise ValueError("API key cannot be empty")

        self.api_key = api_key
        self.base_url = "https://api.apollo.io/api/v1"
        self.headers = {
            "Content-Type": "application/json",
            "X-Api-Key": self.api_key,
            "accept": "application/json",
            "Cache-Control": "no-cache"
        }

    async def people_enrichment(self, query: PeopleEnrichmentQuery) -> Optional[PeopleEnrichmentResponse]:
        """
        Call People Enrichment endpoint to enrich data for a specific person.

        This endpoint takes identifying information (email, phone, or Apollo ID)
        and returns detailed information about the person including:
        - Personal info (name, title, location)
        - Company info (name, size, industry, website)
        - Social links (LinkedIn, Twitter)
        - Contact info (email, phone if available)

        Args:
            query: PeopleEnrichmentQuery object containing search parameters.
                   Can provide: id, email, or phone

        Returns:
            PeopleEnrichmentResponse if successful (status 200)
            None if error (logs error to console)

        Raises:
            httpx.HTTPStatusError: When API returns non-success status code

        Reference:
            https://docs.apollo.io/reference/people-enrichment

        Example:
            >>> query = PeopleEnrichmentQuery(email="john@company.com")
            >>> response = await client.people_enrichment(query)
            >>> if response:
            ...     person = response.person
            ...     print(f"Found: {person.name} at {person.organization.name}")
        """
        url = f"{self.base_url}/people/match"
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=query.model_dump(), headers=self.headers)
            if response.status_code == 200:
                return PeopleEnrichmentResponse(**response.json())
            else:
                print(f"Error: {response.status_code} - {response.text}")
                return None

    async def organization_enrichment(self, query: OrganizationEnrichmentQuery) -> Optional[OrganizationEnrichmentResponse]:
        """
        Call Organization Enrichment endpoint to enrich data for a specific company.

        This endpoint takes identifying information (domain or Apollo organization ID)
        and returns detailed information including:
        - Company name, domain, logo
        - Employee count, industry
        - Location (headquarters)
        - Social links (LinkedIn, Twitter, Facebook)
        - Tech stack used
        - Financial info (if available)

        Args:
            query: OrganizationEnrichmentQuery object containing parameters.
                   Provide: domain (e.g., "company.com") or id (Apollo organization ID)

        Returns:
            OrganizationEnrichmentResponse if successful (status 200)
            None if error (logs error to console)

        Reference:
            https://docs.apollo.io/reference/organization-enrichment

        Example:
            >>> query = OrganizationEnrichmentQuery(domain="example.com")
            >>> response = await client.organization_enrichment(query)
            >>> if response:
            ...     org = response.organization
            ...     print(f"Found: {org.name} - {org.num_employees} employees")
        """
        url = f"{self.base_url}/organizations/enrich"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=query.model_dump(), headers=self.headers)
            if response.status_code == 200:
                return OrganizationEnrichmentResponse(**response.json())
            else:
                print(f"Error: {response.status_code} - {response.text}")
                return None

    async def people_search(self, query: PeopleSearchQuery) -> Optional[PeopleSearchResponse]:
        """
        Call People Search endpoint to search for people by criteria.

        This endpoint allows searching for people based on many criteria:
        - Job titles (person_titles)
        - Seniority level (person_seniorities: C-level, VP, Director, Manager, etc)
        - Location (country, city)
        - Industry (organization_industries)
        - Company size (organization_num_employees_ranges)
        - Company domain (q_organization_domains_list)
        - And many other criteria...

        Args:
            query: PeopleSearchQuery object containing search criteria.
                   Common parameters:
                   - person_titles: ["CEO", "Marketing Manager"]
                   - person_seniorities: ["vp", "director"]
                   - organization_locations: ["USA", "UK"]
                   - organization_industries: ["technology", "finance"]
                   - page: page number (starts from 1)
                   - per_page: results per page (max 100)

        Returns:
            PeopleSearchResponse if successful (status 200)
            None if error (logs error to console)

        Reference:
            https://docs.apollo.io/reference/people-search

        Example:
            >>> query = PeopleSearchQuery(
            ...     person_titles=["CEO", "CTO"],
            ...     organization_locations=["USA"],
            ...     organization_num_employees_ranges=["100,1000"],
            ...     page=1,
            ...     per_page=10
            ... )
            >>> response = await client.people_search(query)
            >>> for person in response.results:
            ...     print(f"{person.name} - {person.title}")
        """
        url = f"{self.base_url}/mixed_people/api_search"
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=query.model_dump(), headers=self.headers)
            if response.status_code == 200:
                return PeopleSearchResponse(**response.json())
            else:
                print(f"Error: {response.status_code} - {response.text}")
                return None

    async def organization_search(self, query: OrganizationSearchQuery) -> Optional[OrganizationSearchResponse]:
        """
        Call Organization Search endpoint to search for organizations by criteria.

        This endpoint allows searching for companies based on many criteria:
        - Employee count (organization_num_employees_ranges)
        - Location (country, city)
        - Industry (organization_industries)
        - Domain (q_organization_domains_list)
        - Tech stack used
        - And many other criteria...

        Args:
            query: OrganizationSearchQuery object containing search criteria.
                   Common parameters:
                   - organization_num_employees_ranges: ["100,500", "500,1000"]
                   - organization_locations: ["USA", "Germany"]
                   - organization_industries: ["technology", "healthcare"]
                   - page: page number
                   - per_page: results per page

        Returns:
            OrganizationSearchResponse if successful (status 200)
            None if error (logs error to console)

        Reference:
            https://docs.apollo.io/reference/organization-search

        Example:
            >>> query = OrganizationSearchQuery(
            ...     organization_num_employees_ranges=["100,1000"],
            ...     organization_locations=["USA"],
            ...     organization_industries=["technology"],
            ...     page=1,
            ...     per_page=20
            ... )
            >>> response = await client.organization_search(query)
            >>> for org in response.organizations:
            ...     print(f"{org.name} - {org.domain}")
        """
        url = f"{self.base_url}/mixed_companies/search"
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=query.model_dump(), headers=self.headers)
            if response.status_code == 200:
                return OrganizationSearchResponse(**response.json())
            else:
                print(f"Error: {response.status_code} - {response.text}")
                return None

    async def organization_job_postings(self, organization_id: str) -> Optional[OrganizationJobPostingsResponse]:
        """
        Call Organization Job Postings endpoint to get job postings for a company.

        This endpoint returns the job openings indexed on Apollo, including:
        - Job title
        - Location
        - Job URL
        - Posted date
        - Job description (if available)

        Args:
            organization_id: Apollo organization ID (not domain)
                   Example: "5e66b6381e05b4008c8331b8"

        Returns:
            OrganizationJobPostingsResponse if successful (status 200)
            None if error (logs error to console)

        Reference:
            https://docs.apollo.io/reference/organization-jobs-postings

        Example:
            >>> response = await client.organization_job_postings("5e66b6381e05b4008c8331b8")
            >>> for job in response.job_postings:
            ...     print(f"{job.title} - {job.location}")
        """
        url = f"{self.base_url}/organizations/{organization_id}/job_postings"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers)
            if response.status_code == 200:
                return OrganizationJobPostingsResponse(**response.json())
            else:
                print(f"Error: {response.status_code} - {response.text}")
                return None

# Example usage (you'll need to set the APOLLO_IO_API_KEY environment variable)
async def main():
    import os

    from dotenv import load_dotenv

    load_dotenv("key.env")
    api_key = os.getenv('APOLLO_IO_API_KEY')  # Replace with your actual API key or use os.getenv("APOLLO_IO_API_KEY")
    print(f"API Key: {api_key}")
    client = ApolloClient(api_key)

    # Example People Enrichment
    people_enrichment_query = PeopleEnrichmentQuery(
        id = "54c1b6d774686916394b5d3a",
    )
    people_enrichment_response = await client.people_enrichment(people_enrichment_query)

    if people_enrichment_response:
        print("People Enrichment Response:", people_enrichment_response.model_dump_json(indent=2))
    else:
        print("People Enrichment failed.")

    # # Example Organization Enrichment
    # organization_enrichment_query = OrganizationEnrichmentQuery(
    #     domain="apollo.io",
    # )
    # organization_enrichment_response = await client.organization_enrichment(organization_enrichment_query)

    # if organization_enrichment_response:
    #     print("Organization Enrichment Response:", organization_enrichment_response.model_dump_json(indent=2))
    # else:
    #     print("Organization Enrichment failed.")

    # # Example People Search
    # people_search_query = PeopleSearchQuery(
    #     person_titles=["Marketing Manager"],
    #     person_seniorities=["vp"],
    #     q_organization_domains_list=["apollo.io"]
    # )
    # people_search_response = await client.people_search(people_search_query)

    # if people_search_response:
    #     print("People Search Response:", people_search_response.model_dump_json(indent=2))
    # else:
    #     print("People Search failed.")

    # # Example Organization Search
    # organization_search_query = OrganizationSearchQuery(
    #     organization_num_employees_ranges=["250,1000"],
    #     organization_locations=["japan", "ireland"]
    # )
    # organization_search_response = await client.organization_search(organization_search_query)

    # if organization_search_response:
    #     print("Organization Search Response:", organization_search_response.model_dump_json(indent=2))
    # else:
    #     print("Organization Search failed.")

    # # Example Organization Job Postings
    # organization_job_postings_response = await client.organization_job_postings(organization_id="5e66b6381e05b4008c8331b8")

    # if organization_job_postings_response:
    #     print("Organization Job Postings Response:", organization_job_postings_response.model_dump_json(indent=2))
    # else:
    #     print("Organization Job Postings failed.")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
