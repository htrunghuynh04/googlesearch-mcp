from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class OrganizationSearchQuery(BaseModel):
    organization_num_employees_ranges: Optional[List[str]] = Field(default=None, description="The number range of employees working for the company. This enables you to find companies based on headcount. You can add multiple ranges to expand your search results. Each range you add needs to be a string, with the upper and lower numbers of the range separated only by a comma. Examples: `1,10`; `250,500`; `10000,20000`")
    organization_locations: Optional[List[str]] = Field(default=None, description="The location of the company headquarters. You can search across cities, US states, and countries. If a company has several office locations, results are still based on the headquarters location. For example, if you search `chicago` but a company's HQ location is in `boston`, any Boston-based companies will not appearch in your search results, even if they match other parameters. To exclude companies based on location, use the `organization_not_locations` parameter. Examples: `texas`; `tokyo`; `spain`")
    organization_not_locations: Optional[List[str]] = Field(default=None, description="Exclude companies from search results based on the location of the company headquarters. You can use cities, US states, and countries as locations to exclude. This parameter is useful for ensuring you do not prospect in an undesirable territory. For example, if you use `ireland` as a value, no Ireland-based companies will appear in your search results. Examples: `minnesota`; `ireland`; `seoul`")
    revenue_range_min: Optional[int] = Field(default=None, description="Search for organizations based on their revenue. Use this parameter to set the lower range of organization revenue. Use the `revenue_range[max]` parameter to set the upper range of revenue. Do not enter currency symbols, commas, or decimal points in the figure. Example: `300000`")
    revenue_range_max: Optional[int] = Field(default=None, description="Search for organizations based on their revenue. Use this parameter to set the upper range of organization revenue. Use the `revenue_range[min]` parameter to set the lower range of revenue. Do not enter currency symbols, commas, or decimal points in the figure. Example: `50000000`")
    currently_using_any_of_technology_uids: Optional[List[str]] = Field(default=None, description="Find organizations based on the technologies they currently use. Apollo supports filtering by 1,500+ technologies. Apollo calculates technologies data from multiple sources. This data is updated regularly. Check out the full list of supported technologies by [downloading this CSV file](https://api.apollo.io/v1/auth/supported_technologies_csv). Use underscores (`_`) to replace spaces and periods for the technologies listed in the CSV file. Examples: `salesforce`; `google_analytics`; `wordpress_org`")
    q_organization_keyword_tags: Optional[List[str]] = Field(default=None, description="Filter search results based on keywords associated with companies. For example, you can enter `mining` as a value to return only companies that have an association with the mining industry. Examples: `mining`; `sales strategy`; `consulting`")
    q_organization_name: Optional[str] = Field(default=None, description="Filter search results to include a specific company name. If the value you enter for this parameter does not match with a company's name, the company will not appear in search results, even if it matches other parameters. Partial matches are accepted. For example, if you filter by the value `marketing`, a company called `NY Marketing Unlimited` would still be eligible as a search result, but `NY Market Analysis` would not be eligible. Example: `apollo` or `mining`")
    organization_ids: Optional[List[str]] = Field(default=None, description="The Apollo IDs for the companies you want to include in your search results. Each company in the Apollo database is assigned a unique ID. To find IDs, identify the values for `organization_id` when you call this endpoint. Example: `5e66b6381e05b4008c8331b8`")
    page: Optional[int] = Field(default=None, description="The page number of the Apollo data that you want to retrieve. Use this parameter in combination with the `per_page` parameter to make search results for navigable and improve the performance of the endpoint. Example: `4`")
    per_page: Optional[int] = Field(default=None, description="The number of search results that should be returned for each page. Limited the number of results per page improves the endpoint's performance. Use the `page` parameter to search the different pages of data. Example: `10`")

class Breadcrumb(BaseModel):
    label: str = Field(description="label")
    signal_field_name: str = Field(description="signal_field_name")
    value: str = Field(description="value")
    display_name: str = Field(description="display_name")

class PrimaryPhone(BaseModel):
    number: str = Field(description="number")
    source: str = Field(description="source")
    sanitized_number: str = Field(description="sanitized_number")

class Organization(BaseModel):
    id: str = Field(description="id")
    name: Optional[str] = Field(default=None, description="name")
    website_url: Optional[str] = Field(default=None, description="website_url")
    blog_url: Optional[str] = Field(default=None, description="blog_url")
    angellist_url: Optional[str] = Field(default=None, description="angellist_url")
    linkedin_url: Optional[str] = Field(default=None, description="linkedin_url")
    twitter_url: Optional[str] = Field(default=None, description="twitter_url")
    facebook_url: Optional[str] = Field(default=None, description="facebook_url")
    primary_phone: Optional[PrimaryPhone] = Field(default=None, description="primary_phone")
    languages: Optional[List[str]] = Field(default=None, description="languages")
    alexa_ranking: Optional[int] = Field(default=0, description="alexa_ranking")
    phone: Optional[str] = Field(default=None, description="phone")
    linkedin_uid: Optional[str] = Field(default=None, description="linkedin_uid")
    founded_year: Optional[int] = Field(default=0, description="founded_year")
    publicly_traded_symbol: Optional[str] = Field(default=None, description="publicly_traded_symbol")
    publicly_traded_exchange: Optional[str] = Field(default=None, description="publicly_traded_exchange")
    logo_url: Optional[str] = Field(default=None, description="logo_url")
    crunchbase_url: Optional[str] = Field(default=None, description="crunchbase_url")
    primary_domain: Optional[str] = Field(default=None, description="primary_domain")
    sanitized_phone: Optional[str] = Field(default=None, description="sanitized_phone")
    owned_by_organization_id: Optional[str] = Field(default=None, description="owned_by_organization_id")
    intent_strength: Optional[str] = Field(default=None, description="intent_strength")
    show_intent: Optional[bool] = Field(default=None, description="show_intent")
    has_intent_signal_account: Optional[bool] = Field(default=None, description="has_intent_signal_account")
    intent_signal_account: Optional[str] = Field(default=None, description="intent_signal_account")

class Pagination(BaseModel):
    page: int = Field(default=0, description="page")
    per_page: int = Field(default=0, description="per_page")
    total_entries: int = Field(default=0, description="total_entries")
    total_pages: int = Field(default=0, description="total_pages")

class OrganizationSearchResponse(BaseModel):
    breadcrumbs: Optional[List[Breadcrumb]] = Field(default=None, description="breadcrumbs")
    partial_results_only: Optional[bool] = Field(default=True, description="partial_results_only")
    has_join: Optional[bool] = Field(default=True, description="has_join")
    disable_eu_prospecting: Optional[bool] = Field(default=True, description="disable_eu_prospecting")
    partial_results_limit: Optional[int] = Field(default=0, description="partial_results_limit")
    pagination: Optional[Pagination] = Field(default=None, description="pagination")
    accounts: Optional[List[Any]] = Field(default=None, description="accounts")
    organizations: Optional[List[Organization]] = Field(default=None, description="organizations")
    model_ids: Optional[List[str]] = Field(default=None, description="model_ids")
    num_fetch_result: Optional[str] = Field(default=None, description="num_fetch_result")
    derived_params: Optional[str] = Field(default=None, description="derived_params")
