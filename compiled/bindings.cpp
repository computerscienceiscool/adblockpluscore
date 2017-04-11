/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2017 eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

#include "bindings.ipp"
#include "filter/Filter.h"
#include "filter/InvalidFilter.h"
#include "filter/CommentFilter.h"
#include "filter/ActiveFilter.h"
#include "filter/RegExpFilter.h"
#include "filter/BlockingFilter.h"
#include "filter/WhitelistFilter.h"
#include "filter/ElemHideBase.h"
#include "filter/ElemHideFilter.h"
#include "filter/ElemHideException.h"
#include "filter/ElemHideEmulationFilter.h"
#include "subscription/Subscription.h"
#include "subscription/DownloadableSubscription.h"
#include "subscription/UserDefinedSubscription.h"

EMSCRIPTEN_BINDINGS
{
  class_<Filter>("Filter")
      .property("text", &Filter::GetText)
      .function("serialize", &Filter::Serialize)
      .class_function("fromText", &Filter::FromText)
      .subclass_differentiator(&Filter::mType, {
        {Filter::Type::INVALID, "InvalidFilter"},
        {Filter::Type::COMMENT, "CommentFilter"},
        {Filter::Type::BLOCKING, "BlockingFilter"},
        {Filter::Type::WHITELIST, "WhitelistFilter"},
        {Filter::Type::ELEMHIDE, "ElemHideFilter"},
        {Filter::Type::ELEMHIDEEXCEPTION, "ElemHideException"},
        {Filter::Type::ELEMHIDEEMULATION, "ElemHideEmulationFilter"},
      });

  class_<InvalidFilter,Filter>("InvalidFilter")
      .class_property("type", "'invalid'")
      .property("reason", &InvalidFilter::GetReason);

  class_<CommentFilter,Filter>("CommentFilter")
      .class_property("type", "'comment'");

  class_<ActiveFilter,Filter>("ActiveFilter")
      .property("disabled", &ActiveFilter::GetDisabled, &ActiveFilter::SetDisabled)
      .property("hitCount", &ActiveFilter::GetHitCount, &ActiveFilter::SetHitCount)
      .property("lastHit", &ActiveFilter::GetLastHit, &ActiveFilter::SetLastHit)
      .function("isActiveOnDomain", &ActiveFilter::IsActiveOnDomain)
      .function("isActiveOnlyOnDomain", &ActiveFilter::IsActiveOnlyOnDomain)
      .function("isGeneric", &ActiveFilter::IsGeneric)
      .function("serialize", &ActiveFilter::Serialize);

  class_<RegExpFilter,ActiveFilter>("RegExpFilter")
      .function("matches", &RegExpFilter::Matches);

  custom_generator(&RegExpFilter::GenerateCustomBindings);

  class_<BlockingFilter,RegExpFilter>("BlockingFilter")
      .class_property("type", "'blocking'");

  class_<WhitelistFilter,RegExpFilter>("WhitelistFilter")
      .class_property("type", "'whitelist'");

  class_<ElemHideBase,ActiveFilter>("ElemHideBase")
      .property("selector", &ElemHideBase::GetSelector)
      .property("selectorDomain", &ElemHideBase::GetSelectorDomain);

  class_<ElemHideFilter,ElemHideBase>("ElemHideFilter")
      .class_property("type", "'elemhide'");

  class_<ElemHideException,ElemHideBase>("ElemHideException")
      .class_property("type", "'elemhideexception'");

  class_<ElemHideEmulationFilter,ElemHideBase>("ElemHideEmulationFilter")
      .class_property("type", "'elemhideemulation'");

  class_<Subscription>("Subscription")
      .property("url", &Subscription::GetID)
      .property("title", &Subscription::GetTitle, &Subscription::SetTitle)
      .property("disabled", &Subscription::GetDisabled, &Subscription::SetDisabled)
      .property("filterCount", &Subscription::GetFilterCount)
      .function("filterAt", &Subscription::FilterAt)
      .function("indexOfFilter", &Subscription::IndexOfFilter)
      .function("serialize", &Subscription::Serialize)
      .function("serializeFilters", &Subscription::SerializeFilters)
      .class_function("fromURL", &Subscription::FromID)
      .subclass_differentiator(&Subscription::mType, {
        {Subscription::Type::USERDEFINED, "SpecialSubscription"},
        {Subscription::Type::DOWNLOADABLE, "DownloadableSubscription"},
      });

  class_<UserDefinedSubscription,Subscription>("SpecialSubscription")
      .function("isDefaultFor", &UserDefinedSubscription::IsDefaultFor)
      .function("makeDefaultFor", &UserDefinedSubscription::MakeDefaultFor)
      .function("insertFilterAt", &UserDefinedSubscription::InsertFilterAt)
      .function("removeFilterAt", &UserDefinedSubscription::RemoveFilterAt)
      .function("serialize", &UserDefinedSubscription::Serialize);

  class_<DownloadableSubscription,Subscription>("DownloadableSubscription")
      .property("fixedTitle", &DownloadableSubscription::GetFixedTitle, &DownloadableSubscription::SetFixedTitle)
      .property("homepage", &DownloadableSubscription::GetHomepage, &DownloadableSubscription::SetHomepage)
      .property("lastCheck", &DownloadableSubscription::GetLastCheck, &DownloadableSubscription::SetLastCheck)
      .property("expires", &DownloadableSubscription::GetHardExpiration, &DownloadableSubscription::SetHardExpiration)
      .property("softExpiration", &DownloadableSubscription::GetSoftExpiration, &DownloadableSubscription::SetSoftExpiration)
      .property("lastDownload", &DownloadableSubscription::GetLastDownload, &DownloadableSubscription::SetLastDownload)
      .property("downloadStatus", &DownloadableSubscription::GetDownloadStatus, &DownloadableSubscription::SetDownloadStatus)
      .property("lastSuccess", &DownloadableSubscription::GetLastSuccess, &DownloadableSubscription::SetLastSuccess)
      .property("errors", &DownloadableSubscription::GetErrorCount, &DownloadableSubscription::SetErrorCount)
      .property("version", &DownloadableSubscription::GetDataRevision, &DownloadableSubscription::SetDataRevision)
      .property("requiredVersion", &DownloadableSubscription::GetRequiredVersion, &DownloadableSubscription::SetRequiredVersion)
      .property("downloadCount", &DownloadableSubscription::GetDownloadCount, &DownloadableSubscription::SetDownloadCount)
      .function("serialize", &DownloadableSubscription::Serialize);
}